#include "DefinitionBuilder.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
DefinitionBuilder::DefinitionBuilder( CompilerWorkspace& workspace, const Position& position )
    : SemanticContextBuilder( workspace, position )
{
}

std::optional<SourceLocation> DefinitionBuilder::get_constant( ConstDeclaration* const_decl )
{
  return const_decl->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_variable( std::shared_ptr<Variable> variable )
{
  return variable->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  return function_def->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_user_function( UserFunction* function_def )
{
  return function_def->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_module_function_parameter(
    ModuleFunctionDeclaration* function_def, FunctionParameterDeclaration* param )
{
  return param->source_location;
}


std::optional<SourceLocation> DefinitionBuilder::get_user_function_parameter(
    UserFunction* function_def, FunctionParameterDeclaration* param )
{
  return param->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_program( const std::string& name,
                                                              Program* program )
{
  return program->source_location;
}

std::optional<Pol::Bscript::Compiler::SourceLocation> DefinitionBuilder::get_program_parameter(
    const std::string& name )
{
  if ( auto& program = workspace.program )
  {
    for ( auto& child : program->parameter_list().children )
    {
      auto& program_parameter = static_cast<ProgramParameterDeclaration&>( *child );
      if ( program_parameter.name == name )
      {
        return program_parameter.source_location;
      }
    }
  }
  return {};
}


}  // namespace VSCodeEscript::CompilerExt