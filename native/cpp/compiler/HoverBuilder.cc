#include "HoverBuilder.h"

#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "clib/strutil.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
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
  append_comment( const_decl, result );
  return result;
}

std::optional<std::string> HoverBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  std::string result = "(variable) ";
  result += variable->name;
  append_comment( variable->var_decl_location, result );
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
  append_comment( function_def, result );
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
  append_comment( function_def, result );
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
  append_comment( program, result );
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

void HoverBuilder::append_comment( const SourceLocation& source_location, std::string& result )
{
  std::string comment;
  const auto& pathname = source_location.source_file_identifier->pathname;
  auto itr = workspace.builder_workspace.source_files.find( pathname );
  auto tokens = workspace.source->get_all_tokens();
  if ( itr != workspace.builder_workspace.source_files.end() )
  {
    auto sf = itr->second;
    auto hidden_tokens = sf->get_hidden_tokens_before( source_location.range.start );

    for ( auto const* token : hidden_tokens )
    {
      auto token_text = Pol::Clib::strtrim( token->getText() );
      if ( token_text.length() == 0 )
      {
        continue;
      }

      comment += "\n" + token_text;
    }
  }
  if ( !comment.empty() )
  {
    result += "\n" + comment;
  }
}

void HoverBuilder::append_comment( Node* node, std::string& result )
{
  append_comment( node->source_location, result );
}
}  // namespace VSCodeEscript::CompilerExt