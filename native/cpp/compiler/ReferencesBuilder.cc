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

namespace VSCodeEscript::CompilerExt
{

bool source_location_equal( const SourceLocation& a, const SourceLocation& b )
{
  return a.range.start.line_number == b.range.start.line_number &&
         a.range.start.character_column == b.range.start.character_column &&
         a.range.end.line_number == b.range.end.line_number &&
         a.range.end.character_column == b.range.end.character_column &&
         stricmp( a.source_file_identifier->pathname.c_str(),
                  b.source_file_identifier->pathname.c_str() ) == 0;
}

bool SourceLocationComparator::operator()( const SourceLocation& x1,
                                           const SourceLocation& x2 ) const
{
  if ( x1.range.start.line_number != x2.range.start.line_number )
  {
    return x1.range.start.line_number < x2.range.start.line_number;
  }
  if ( x1.range.start.character_column != x2.range.start.character_column )
  {
    return x1.range.start.character_column < x2.range.start.character_column;
  }
  if ( x1.range.start.token_index != x2.range.start.token_index )
  {
    return x1.range.start.token_index < x2.range.start.token_index;
  }

  if ( x1.range.end.line_number != x2.range.end.line_number )
  {
    return x1.range.end.line_number < x2.range.end.line_number;
  }
  if ( x1.range.end.character_column != x2.range.end.character_column )
  {
    return x1.range.end.character_column < x2.range.end.character_column;
  }
  if ( x1.range.end.token_index != x2.range.end.token_index )
  {
    return x1.range.end.token_index < x2.range.end.token_index;
  }

  // Compare source file identifiers
  auto compare = stricmp( x1.source_file_identifier->pathname.c_str(),
                          x2.source_file_identifier->pathname.c_str() );

  if ( compare != 0 )
  {
    return compare < 0;
  }

  return false;
}

class GlobalIdentifierFinder : public NodeVisitor
{
public:
  GlobalIdentifierFinder( ReferencesResult& results,
                          const SourceLocation& definition_source_location )
      : results( results ), definition_source_location( definition_source_location )
  {
  }

  void visit_identifier( Identifier& node ) override
  {
    if ( node.variable &&
         source_location_equal( definition_source_location, node.variable->source_location ) )
    {
      results.emplace( node.source_location );
    }

    visit_children( node );
  };

  ReferencesResult& results;

  const SourceLocation& definition_source_location;
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

      results.emplace( SourceLocation( node.source_location.source_file_identifier, r ) );
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

  void visit_children( Node& node )
  {
    for ( auto& child : node.children )
    {
      if ( !child )
      {
        continue;
      }

      if ( child->unoptimized_node )
      {
        if ( auto identifier = dynamic_cast<Identifier*>( child->unoptimized_node.get() ) )
        {
          if ( identifier->name == const_decl->identifier )
          {
            results.emplace( identifier->source_location );
          }
        }
      }
      child->accept( *this );
    }
  }

  ReferencesResult& results;

  ConstDeclaration* const_decl;
};

ReferencesBuilder::ReferencesBuilder( CompilerWorkspace& workspace, LSPWorkspace* lsp_workspace,
                                      const Position& position )
    : SemanticContextBuilder( workspace, position ), lsp_workspace( lsp_workspace )
{
}

std::optional<ReferencesResult> ReferencesBuilder::get_variable(
    std::shared_ptr<Variable> variable )
{
  auto ext = fs::path( variable->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  GlobalIdentifierFinder finder( results, variable->source_location );
  if ( is_source )
  {
    workspace.accept( finder );
  }
  else
  {
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( finder ); } );
  }
  return results;
}


std::optional<ReferencesResult> ReferencesBuilder::get_constant( ConstDeclaration* const_decl )
{
  auto ext = fs::path( const_decl->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  GlobalConstantFinder finder( results, const_decl );
  if ( is_source )
  {
    workspace.accept( finder );
  }
  else
  {
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( finder ); } );
  }
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_module_function(
    ModuleFunctionDeclaration* funct )
{
  ReferencesResult results;
  GlobalFunctionFinder finder( results, funct );
  lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                      { document->accept_visitor( finder ); } );
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_program_parameter( const std::string& name )
{
  ReferencesResult results;
  if ( auto& program = workspace.program )
  {
    for ( auto& child : program->parameter_list().children )
    {
      auto& program_parameter = static_cast<ProgramParameterDeclaration&>( *child );
      if ( program_parameter.name == name )
      {
        GlobalIdentifierFinder finder( results, program_parameter.source_location );
        finder.visit_function_body( program->body() );
        return results;
      }
    }
  }
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_user_function_parameter(
    UserFunction* function_def, FunctionParameterDeclaration* param )
{
  ReferencesResult results;
  GlobalIdentifierFinder finder( results, param->source_location );
  workspace.accept( finder );
  return results;
}

std::optional<ReferencesResult> ReferencesBuilder::get_user_function( UserFunction* funct )
{
  auto ext = fs::path( funct->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  ReferencesResult results;
  GlobalFunctionFinder finder( results, funct );
  if ( is_source )
  {
    workspace.accept( finder );
  }
  else
  {
    lsp_workspace->foreach_cache_entry( [&]( LSPDocument* document )
                                        { document->accept_visitor( finder ); } );
  }
  return results;
}

}  // namespace VSCodeEscript::CompilerExt