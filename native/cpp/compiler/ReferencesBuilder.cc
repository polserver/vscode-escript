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


class VariableFinder : public NodeVisitor
{
public:
  VariableFinder( std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
      : variable( variable )
  {
  }

  void visit_identifier( Identifier& node ) override
  {
    if ( node.variable == variable )
    {
      results.push_back( node.source_location );
    }

    visit_children( node );
  };

  std::vector<SourceLocation> results;

  const std::shared_ptr<Pol::Bscript::Compiler::Variable> variable;
};

class UserFunctionFinder : public NodeVisitor
{
public:
  UserFunctionFinder( ReferencesResult& results, UserFunction* user_function )
      : results( results ), user_function( user_function )
  {
  }

  void visit_function_call( FunctionCall& node ) override
  {
    if ( auto link = node.function_link )
    {
      if ( link->user_function() == user_function )
      {
        results.push_back( node.source_location );
      }
      // else if ( link->module_function_declaration() == user_function )
      // {
      //   results.push_back( node.source_location );
      // }
    }

    visit_children( node );
  };

  ReferencesResult& results;

  const UserFunction* user_function;
};

bool source_location_equal( const SourceLocation& a, const SourceLocation& b )
{
  return a.range.start.line_number == b.range.start.line_number &&
         a.range.start.character_column == b.range.start.character_column &&
         a.range.end.line_number == b.range.end.line_number &&
         a.range.end.character_column == b.range.end.character_column &&
         a.source_file_identifier->pathname == b.source_file_identifier->pathname;
}
class GlobalUserFunctionFinder : public NodeVisitor
{
public:
  GlobalUserFunctionFinder( ReferencesResult& results, UserFunction* user_function )
      : results( results ), user_function( user_function )
  {
  }

  void visit_function_call( FunctionCall& node ) override
  {
    if ( auto link = node.function_link )
    {
      if ( auto user_function_link = link->user_function() )
      {
        if ( source_location_equal( user_function_link->source_location,
                                    user_function->source_location ) )
        {
          // We need to make a new location for only the method name, as FunctionCall source
          // location includes the arguments
          // results.push_back( node.source_location );
          // Position{}

          const auto& start = node.source_location.range.start;
          Range r{
              { start.line_number, start.character_column },
              { start.line_number, static_cast<unsigned short>( start.character_column +
                                                                node.method_name.length() ) } };

          results.push_back( SourceLocation( node.source_location.source_file_identifier, r ) );

          // results.push_back(
          //     SourceLocation( node.source_location.source_file_identifier,
          //                     { { start.line_number, start.character_column },
          //                       { start.line_number,
          //                         static_cast<unsigned short>( start.character_column +
          //                                                      node.method_name.length() ) } } )
          //                                                      );
        }
      }
      // else if ( link->module_function_declaration() == user_function )
      // {
      //   results.push_back( node.source_location );
      // }
    }

    // for includess, the children of function calls are empty...?
    for ( auto& child : node.children )
    {
      if ( child )
      {
        child->accept( *this );
      }
    }
  };

  ReferencesResult& results;

  const UserFunction* user_function;
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
  auto is_source = !ext.compare( ".inc" );

  if ( is_source )
  {
    VariableFinder foo( variable );
    workspace.accept( foo );
    return foo.results;
  }
  else
  {
    // TODO check where this include file's variable is used in referenced includes _and_ all
    // other srcs
  }

  return std::nullopt;
}

std::optional<ReferencesResult> ReferencesBuilder::get_user_function( UserFunction* funct )
{
  auto ext = fs::path( funct->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  if ( is_source )
  {
    UserFunctionFinder foo( results, funct );
    workspace.accept( foo );
  }
  else
  {
    GlobalUserFunctionFinder foo( results, funct );
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( foo ); } );
  }
  return results;
}

}  // namespace VSCodeEscript::CompilerExt