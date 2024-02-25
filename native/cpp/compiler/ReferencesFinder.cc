#include "ReferencesFinder.h"

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
ReferencesFinder::ReferencesFinder( CompilerWorkspace& workspace, LSPWorkspace* lsp_workspace,
                                    const Position& position )
    : SemanticContextBuilder( workspace, position ), lsp_workspace( lsp_workspace )
{
}

std::optional<ReferencesResult> ReferencesFinder::get_variable( std::shared_ptr<Variable> variable )
{
  return get_references_by_definition( variable->source_location );
}

std::optional<ReferencesResult> ReferencesFinder::get_constant( ConstDeclaration* const_decl )
{
  return get_references_by_definition( const_decl->source_location );
}

std::optional<ReferencesResult> ReferencesFinder::get_module_function(
    ModuleFunctionDeclaration* funct )
{
  const auto& start = funct->source_location.range.start;
  Range r{ { start.line_number, start.character_column },
           { start.line_number,
             static_cast<unsigned short>( start.character_column + funct->name.length() ) } };

  return get_references_by_definition( funct->source_location.source_file_identifier->pathname, r );
}

std::optional<ReferencesResult> ReferencesFinder::get_program_parameter( const std::string& name )
{
  if ( auto& program = workspace.program )
  {
    for ( auto& child : program->parameter_list().children )
    {
      auto& program_parameter = static_cast<ProgramParameterDeclaration&>( *child );
      if ( program_parameter.name == name )
      {
        return get_references_by_definition( program_parameter.source_location );
      }
    }
  }
  return {};
}

std::optional<ReferencesResult> ReferencesFinder::get_user_function_parameter(
    UserFunction* function_def, FunctionParameterDeclaration* param )
{
  return get_references_by_definition( param->source_location );
}

std::optional<ReferencesResult> ReferencesFinder::get_user_function( UserFunction* funct )
{
  const auto& start = funct->source_location.range.start;
  Range r{ { start.line_number, start.character_column },
           { start.line_number,
             static_cast<unsigned short>( start.character_column + funct->name.length() ) } };
  return get_references_by_definition( funct->source_location.source_file_identifier->pathname, r );
}

std::optional<ReferencesResult> ReferencesFinder::get_references_by_definition(
    const std::string& pathname, const Pol::Bscript::Compiler::Range& range )
{
  auto* lsp_document = lsp_workspace->create_or_get_from_cache( pathname );
  auto references = lsp_document->referenced_by.find( range );
  if ( references != lsp_document->referenced_by.end() )
  {
    return references->second;
  }
  return {};
}
std::optional<ReferencesResult> ReferencesFinder::get_references_by_definition(
    const Pol::Bscript::Compiler::SourceLocation& source_location )
{
  return get_references_by_definition( source_location.source_file_identifier->pathname,
                                       source_location.range );
}

}  // namespace VSCodeEscript::CompilerExt