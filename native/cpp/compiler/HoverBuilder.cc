#include "HoverBuilder.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
template <typename T>
SemanticContextBuilder<T>::SemanticContextBuilder( CompilerWorkspace& workspace,
                                                 const Position& position )
    : workspace( workspace ), position( position )
{
}

HoverBuilder::HoverBuilder( CompilerWorkspace& workspace, const Position& position )
    : SemanticContextBuilder( workspace, position )
{
}

std::optional<std::string> HoverBuilder::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  std::string result = "(constant) ";
  result += const_decl->identifier;
  result += " := ";
  result += const_decl->expression().describe();
  return result;
}

std::optional<std::string> HoverBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  std::string result = "(variable) ";
  result += variable->name;
  return result;
}

std::string parameters_to_string(
    std::vector<std::reference_wrapper<FunctionParameterDeclaration>> params )
{
  bool added = false;
  std::string result;
  for ( const auto& param_ref : params )
  {
    auto& param = param_ref.get();
    if ( added )
    {
      result += ", ";
    }
    else
    {
      added = true;
    }
    result += param.name;
    auto* default_value = param.default_value();
    if ( default_value )
    {
      result += " := ";
      result += default_value->describe();
    }
  }
  return result;
}

std::optional<std::string> HoverBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  std::string result = "(module function) ";
  result += function_def->name;
  result += "(";
  result += parameters_to_string( function_def->parameters() );
  result += ")";
  return result;
}

std::optional<std::string> HoverBuilder::get_user_function(
    Pol::Bscript::Compiler::UserFunction* function_def )
{
  std::string result = "(user function) ";
  result += function_def->name;
  result += "(";
  result += parameters_to_string( function_def->parameters() );
  result += ")";
  return result;
}
std::optional<std::string> HoverBuilder::get_program( const std::string& name,
                                                      Pol::Bscript::Compiler::Program* program )
{
  std::string result = "(program) ";
  result += name;
  result += "(";
  bool added = false;

  for ( const auto& param_ref : program->parameter_list().children )
  {
    if ( auto* param =
             dynamic_cast<Pol::Bscript::Compiler::ProgramParameterDeclaration*>( param_ref.get() ) )
    {
      if ( added )
      {
        result += ", ";
      }
      else
      {
        added = true;
      }
      result += param->name;
    }
  }
  result += ")";
  return result;
}

std::optional<std::string> HoverBuilder::get_module_function_parameter(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string result = "(parameter) ";
  result += param->name;
  if ( auto* default_value = param->default_value() )
  {
    result += " := ";
    result += default_value->describe();
  }
  return result;
}


std::optional<std::string> HoverBuilder::get_user_function_parameter(
    Pol::Bscript::Compiler::UserFunction* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string result = "(parameter) ";
  result += param->name;
  if ( auto* default_value = param->default_value() )
  {
    result += " := ";
    result += default_value->describe();
  }
  return result;
}

std::optional<std::string> HoverBuilder::get_program_parameter( const std::string& name )
{
  std::string result = "(program parameter) ";
  result += name;
  return result;
}

std::optional<std::string> HoverBuilder::get_member( const std::string& name )
{
  std::string result = "(member) ";
  result += name;
  return result;
}

std::optional<std::string> HoverBuilder::get_method( const std::string& name )
{
  std::string result = "(method) ";
  result += name;
  return result;
}


}  // namespace VSCodeEscript::CompilerExt