#include "ReferencesBuilder.h"

#include "../napi/LSPDocument.h"
#include "../napi/LSPWorkspace.h"
#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/FloatValue.h"
#include "bscript/compiler/ast/Function.h"
#include "bscript/compiler/ast/FunctionCall.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/IntegerValue.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/StringValue.h"
#include "bscript/compiler/ast/UninitializedValue.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compiler/model/FunctionLink.h"
#include "bscript/compiler/model/Variable.h"

namespace VSCodeEscript::CompilerExt
{
using namespace Pol::Bscript::Compiler;

ReferencesBuilder::ReferencesBuilder( LSPWorkspace* lsp_workspace,
                                      CompilerWorkspace& compiler_workspace,
                                      const std::string& pathname )
    : NodeVisitor(),
      lsp_workspace( lsp_workspace ),
      compiler_workspace( compiler_workspace ),
      pathname( pathname )
{
}

void ReferencesBuilder::visit_identifier( Identifier& node )
{
  if ( node.variable )
  {
    auto* doc = lsp_workspace->create_or_get_from_cache(
        node.variable->source_location.source_file_identifier->pathname );
    doc->add_reference_by( node.variable->source_location, node.source_location );
  }
  visit_children( node );
}


void add_function_reference( LSPDocument* doc, Function* user_function_link, FunctionCall& node )
{
  // We need to make a new location for only the method name, as FunctionCall source
  // location includes the arguments
  const auto& start = user_function_link->source_location.range.start;
  const auto& used_at_start = node.source_location.range.start;
  Range defined_at{
      { start.line_number, start.character_column },
      { start.line_number, static_cast<unsigned short>( start.character_column +
                                                        user_function_link->name.length() ) } };

  Range used_at{ { used_at_start.line_number, used_at_start.character_column },
                 { used_at_start.line_number,
                   static_cast<unsigned short>( used_at_start.character_column +
                                                user_function_link->name.length() ) } };

  doc->add_reference_by( defined_at, node.source_location.source_file_identifier->pathname,
                         used_at );
}

void ReferencesBuilder::visit_function_call( FunctionCall& node )
{
  if ( auto link = node.function_link )
  {
    if ( auto user_function_link = link->user_function() )
    {
      auto* doc = lsp_workspace->create_or_get_from_cache(
          user_function_link->source_location.source_file_identifier->pathname );

      add_function_reference( doc, user_function_link, node );
    }
    else if ( auto module_function_decl = link->module_function_declaration() )
    {
      auto* doc = lsp_workspace->create_or_get_from_cache(
          module_function_decl->source_location.source_file_identifier->pathname );

      add_function_reference( doc, module_function_decl, node );
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
}


void ReferencesBuilder::visit_float_value( FloatValue& node )
{
  add_unoptimized_constant_reference( node );
}

void ReferencesBuilder::visit_integer_value( IntegerValue& node )
{
  add_unoptimized_constant_reference( node );
}

void ReferencesBuilder::visit_string_value( StringValue& node )
{
  add_unoptimized_constant_reference( node );
}

void ReferencesBuilder::visit_uninitialized_value( UninitializedValue& node )
{
  add_unoptimized_constant_reference( node );
}

void ReferencesBuilder::visit_children( Node& node )
{
  for ( auto& child : node.children )
  {
    if ( !child )
    {
      continue;
    }
    add_unoptimized_constant_reference( *child );
    child->accept( *this );
  }
}
void ReferencesBuilder::add_unoptimized_constant_reference( const Node& node )
{
  if ( node.unoptimized_node )
  {
    if ( auto identifier = dynamic_cast<Identifier*>( node.unoptimized_node.get() ) )
    {
      if ( auto constant = compiler_workspace.constants.find( identifier->name() ) )
      {
        auto* doc = lsp_workspace->create_or_get_from_cache(
            constant->source_location.source_file_identifier->pathname );
        doc->add_reference_by( constant->source_location, node.source_location );
      }
    }
  }
}
}  // namespace VSCodeEscript::CompilerExt
