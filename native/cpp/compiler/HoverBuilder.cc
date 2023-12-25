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

std::optional<HoverResult> HoverBuilder::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  std::string hover = "(constant) ";
  hover += const_decl->identifier;
  hover += " := ";
  hover += const_decl->expression().describe();
  HoverResult result{ HoverResult::SymbolType::CONSTANT, const_decl->identifier, hover };
  return append_comment( const_decl, result );
}

std::optional<HoverResult> HoverBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  std::string hover = "(variable) ";
  hover += variable->name;
  HoverResult result{ HoverResult::SymbolType::VARIABLE, variable->name, hover };
  return append_comment( variable->var_decl_location, result );
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

std::optional<HoverResult> HoverBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  std::string hover = "(module function) ";
  hover += function_def->name;
  hover += "(";
  hover += parameters_to_string( function_def->parameters() );
  hover += ")";
  HoverResult result{ HoverResult::SymbolType::MODULE_FUNCTION, function_def->name, hover };
  return append_comment( function_def, result );
}

std::optional<HoverResult> HoverBuilder::get_user_function(
    Pol::Bscript::Compiler::UserFunction* function_def )
{
  std::string hover = "(user function) ";
  hover += function_def->name;
  hover += "(";
  hover += parameters_to_string( function_def->parameters() );
  hover += ")";
  HoverResult result{ HoverResult::SymbolType::USER_FUNCTION, function_def->name, hover };
  return append_comment( function_def, result );
}

std::optional<HoverResult> HoverBuilder::get_program( const std::string& name,
                                                      Pol::Bscript::Compiler::Program* program )
{
  std::string hover = "(program) ";
  hover += name;
  hover += "(";
  bool added = false;

  for ( const auto& param_ref : program->parameter_list().children )
  {
    if ( auto* param =
             dynamic_cast<Pol::Bscript::Compiler::ProgramParameterDeclaration*>( param_ref.get() ) )
    {
      if ( added )
      {
        hover += ", ";
      }
      else
      {
        added = true;
      }
      hover += param->name;
    }
  }
  hover += ")";
  HoverResult result{ HoverResult::SymbolType::PROGRAM, name, hover };
  return append_comment( program, result );
}

std::optional<HoverResult> HoverBuilder::get_module_function_parameter(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string hover = "(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += default_value->describe();
  }
  HoverResult result{ HoverResult::SymbolType::MODULE_FUNCTION_PARAMETER, param->name, hover };
  return append_comment( function_def, result );
}


std::optional<HoverResult> HoverBuilder::get_user_function_parameter(
    Pol::Bscript::Compiler::UserFunction* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string hover = "(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += default_value->describe();
  }
  HoverResult result{ HoverResult::SymbolType::USER_FUNCTION_PARAMETER, param->name, hover };
  return append_comment( param, result );
}

std::optional<HoverResult> HoverBuilder::get_program_parameter( const std::string& name )
{
  std::string hover = "(program parameter) ";
  hover += name;
  // TODO get comments on program parameters
  return HoverResult{ HoverResult::SymbolType::PROGRAM_PARAMETER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_member( const std::string& name )
{
  std::string hover = "(member) ";
  hover += name;
  return HoverResult{ HoverResult::SymbolType::MEMBER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_method( const std::string& name )
{
  std::string hover = "(method) ";
  hover += name;
  return HoverResult{ HoverResult::SymbolType::METHOD, name, hover };
}

HoverResult& HoverBuilder::append_comment( const SourceLocation& source_location,
                                           HoverResult& result )
{
  std::string comment = std::to_string(static_cast<int>(result.type)) + "\n";
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
    result.hover += "\n" + comment;
  }
  return result;
}

HoverResult& HoverBuilder::append_comment( Node* node, HoverResult& result )
{
  return append_comment( node->source_location, result );
}
}  // namespace VSCodeEscript::CompilerExt