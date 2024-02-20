#include "ReferencesBuilder.h"

#include "../napi/LSPDocument.h"
#include "../napi/LSPWorkspace.h"
#include "bscript/compiler/ast/FunctionCall.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/FunctionLink.h"
#include <filesystem>

namespace fs = std::filesystem;
using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{

bool source_location_equal( const SourceLocation& a, const SourceLocation& b )
{
  return a.range.start.line_number == b.range.start.line_number &&
         a.range.start.character_column == b.range.start.character_column &&
         a.range.end.line_number == b.range.end.line_number &&
         a.range.end.character_column == b.range.end.character_column &&
         a.source_file_identifier->pathname == b.source_file_identifier->pathname;
}

class GlobalVariableFinder : public NodeVisitor
{
public:
  GlobalVariableFinder( ReferencesResult& results,
                        std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
      : results( results ), variable( variable )
  {
  }

  void visit_identifier( Identifier& node ) override
  {
    if ( node.variable &&
         source_location_equal( variable->source_location, node.variable->source_location ) )
    {
      results.push_back( node.source_location );
    }

    visit_children( node );
  };

  std::vector<SourceLocation>& results;

  const std::shared_ptr<Pol::Bscript::Compiler::Variable> variable;
};

class GlobalFunctionFinder : public NodeVisitor
{
public:
  GlobalFunctionFinder( ReferencesResult& results, Function* function )
      : results( results ), function( function )
  {
  }

  template <typename T>
  void add_if_matched( FunctionCall& node, T user_function_link )
  {
    if ( source_location_equal( user_function_link->source_location, function->source_location ) )
    {
      // We need to make a new location for only the method name, as FunctionCall source
      // location includes the arguments

      const auto& start = node.source_location.range.start;
      Range r{ { start.line_number, start.character_column },
               { start.line_number, static_cast<unsigned short>( start.character_column +
                                                                 node.method_name.length() ) } };

      results.push_back( SourceLocation( node.source_location.source_file_identifier, r ) );
    }
  }

  void visit_function_call( FunctionCall& node ) override
  {
    if ( auto link = node.function_link )
    {
      if ( auto user_function_link = link->user_function() )
      {
        add_if_matched( node, user_function_link );
      }
      else if ( auto module_function_decl = link->module_function_declaration() )
      {
        add_if_matched( node, module_function_decl );
      }
    }

    // for includes, the children of function calls are empty...?
    for ( auto& child : node.children )
    {
      if ( child )
      {
        child->accept( *this );
      }
    }
  };

  ReferencesResult& results;

  const Function* function;
};

class GlobalConstantFinder : public NodeVisitor
{
public:
  GlobalConstantFinder( ReferencesResult& results, ConstDeclaration* const_decl )
      : results( results ), const_decl( const_decl )
  {
  }

  void visit_identifier( Identifier& node ) override
  {
    if ( !node.variable && node.name == const_decl->identifier )
    {
      results.push_back( node.source_location );
    }

    visit_children( node );
  };

  std::vector<SourceLocation>& results;

  ConstDeclaration* const_decl;
};

ReferencesBuilder::ReferencesBuilder( CompilerWorkspace& workspace, LSPWorkspace* lsp_workspace,
                                      const Position& position )
    : SemanticContextBuilder( workspace, position ), lsp_workspace( lsp_workspace )
{
}

std::optional<ReferencesResult> ReferencesBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  auto ext = fs::path( variable->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  if ( is_source )
  {
    GlobalVariableFinder foo( results, variable );
    workspace.accept( foo );
  }
  else
  {
    GlobalVariableFinder foo( results, variable );
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( foo ); } );
  }
  return results;
}


std::optional<ReferencesResult> ReferencesBuilder::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  auto ext = fs::path( const_decl->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  if ( is_source )
  {
    GlobalConstantFinder foo( results, const_decl );
    workspace.accept( foo );
  }
  else
  {
    GlobalConstantFinder foo( results, const_decl );
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( foo ); } );
  }
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_module_function(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* funct )
{
  ReferencesResult results;
  GlobalFunctionFinder foo( results, funct );
  lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                      { document->accept_visitor( foo ); } );
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_user_function( UserFunction* funct )
{
  auto ext = fs::path( funct->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  if ( is_source )
  {
    GlobalFunctionFinder foo( results, funct );
    workspace.accept( foo );
  }
  else
  {
    GlobalFunctionFinder foo( results, funct );
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( foo ); } );
  }
  return results;
}

}  // namespace VSCodeEscript::CompilerExt