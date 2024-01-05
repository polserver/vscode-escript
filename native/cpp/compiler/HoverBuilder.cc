#include "HoverBuilder.h"
#include "../misc/XmlDocParser.h"
#include "../napi/ExtensionConfig.h"
#include "../napi/LSPWorkspace.h"

#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "clib/strutil.h"
#include "compiler/file/SourceFile.h"

#include <algorithm>
#include <regex>
#include <string>
#include <tinyxml/tinyxml.h>

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
HoverBuilder::HoverBuilder( LSPWorkspace* lsp_workspace, CompilerWorkspace& workspace,
                            const Position& position )
    : SemanticContextBuilder( workspace, position ), _lsp_workspace( lsp_workspace )
{
}

std::regex literal_tag_regex( "^(?:float|integer|string)-value\\((.*)\\)" );

std::string replace_literal_tags( const std::string& input )
{
  return std::regex_replace( input, literal_tag_regex, "$1" );
}

std::optional<HoverResult> HoverBuilder::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  std::string hover = "```escriptdoc\n(constant) ";
  hover += const_decl->identifier;
  hover += " := ";
  hover += replace_literal_tags(const_decl->expression().describe());
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::CONSTANT, const_decl->identifier, hover };
  return append_comment( const_decl, result );
}

std::optional<HoverResult> HoverBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  std::string hover = "```escriptdoc\n(variable) ";
  hover += variable->name;
  hover += "\n```";
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
      result += replace_literal_tags(default_value->describe());
    }
  }
  return result;
}

std::optional<HoverResult> HoverBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  std::string hover = "```escriptdoc\n(module function) ";
  hover += function_def->name;
  hover += "(";
  hover += parameters_to_string( function_def->parameters() );
  hover += ")\n```";
  HoverResult result{ HoverResult::SymbolType::MODULE_FUNCTION, function_def->name, hover };
  return append_comment( function_def, result );
}

std::optional<HoverResult> HoverBuilder::get_user_function(
    Pol::Bscript::Compiler::UserFunction* function_def )
{
  std::string hover = "```escriptdoc\n(user function) ";
  hover += function_def->name;
  hover += "(";
  hover += parameters_to_string( function_def->parameters() );
  hover += ")\n```";
  HoverResult result{ HoverResult::SymbolType::USER_FUNCTION, function_def->name, hover };
  return append_comment( function_def, result );
}

std::optional<HoverResult> HoverBuilder::get_program( const std::string& name,
                                                      Pol::Bscript::Compiler::Program* program )
{
  std::string hover = "```escriptdoc\n(program) ";
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
  hover += ")\n```";
  HoverResult result{ HoverResult::SymbolType::PROGRAM, name, hover };
  return append_comment( program, result );
}

std::optional<HoverResult> HoverBuilder::get_module_function_parameter(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string hover = "```escriptdoc\n(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += replace_literal_tags(default_value->describe());
  }
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::MODULE_FUNCTION_PARAMETER, param->name, hover,
                      function_def };
  return append_comment( param, result );
}


std::optional<HoverResult> HoverBuilder::get_user_function_parameter(
    Pol::Bscript::Compiler::UserFunction* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string hover = "```escriptdoc\n(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += replace_literal_tags(default_value->describe());
  }
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::USER_FUNCTION_PARAMETER, param->name, hover };
  return append_comment( param, result );
}

std::optional<HoverResult> HoverBuilder::get_program_parameter( const std::string& name )
{
  std::string hover = "```escriptdoc\n(program parameter) ";
  hover += name;
  hover += "\n```";
  // TODO get comments on program parameters
  return HoverResult{ HoverResult::SymbolType::PROGRAM_PARAMETER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_member( const std::string& name )
{
  std::string hover = "```escriptdoc\n(member) ";
  hover += name;
  hover += "\n```";
  return HoverResult{ HoverResult::SymbolType::MEMBER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_method( const std::string& name )
{
  std::string hover = "```escriptdoc\n(method) ";
  hover += name;
  hover += "\n```";
  return HoverResult{ HoverResult::SymbolType::METHOD, name, hover };
}

HoverResult& HoverBuilder::append_comment( const SourceLocation& source_location,
                                           HoverResult& result )
{
  std::string comment = "";
  const auto& pathname = source_location.source_file_identifier->pathname;
  if ( result.type != HoverResult::SymbolType::MODULE_FUNCTION ||
       gExtensionConfiguration.showModuleFunctionComments )
  {
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
      result.hover += "\n---\n```" + comment + "\n```";
    }
  }


  const auto& xmlDoc = _lsp_workspace->get_xml_doc_path( pathname );
  if ( !xmlDoc.has_value() )
    return result;

  if ( result.type == HoverResult::SymbolType::MODULE_FUNCTION_PARAMETER )
  {
    auto parsed = XmlDocParser::parse_function( xmlDoc.value(), result.function_def->name );
    if ( !parsed )
      return result;

    const auto& params = parsed->parameters;
    auto iter = std::find_if( params.begin(), params.end(),
                              [&]( const auto& param ) { return param.name == result.symbol; } );

    if ( iter != params.end() )
    {
      result.hover += "\n\n" + iter->value + "\n\n";
    }
  }
  else if ( result.type == HoverResult::SymbolType::MODULE_FUNCTION )
  {
    auto parsed = XmlDocParser::parse_function( xmlDoc.value(), result.symbol );
    if ( !parsed )
      return result;

    result.hover += "\n---\n" + parsed->explain;
    if ( !parsed->returns.empty() )
      result.hover += "\n\n_Returns_:\n\n- " + parsed->returns + "\n\n";

    if ( !parsed->errors.empty() )
    {
      result.hover += "\n\n_Errors_:\n\n";
      for ( const auto& error : parsed->errors )
      {
        if ( error.length() > 2 && error.at( 0 ) == '"' && error.at( error.size() - 1 ) == '"' )
        {
          result.hover += "- " + error.substr( 1, error.size() - 2 ) + "\n\n";
        }
        else
        {
          result.hover += "- " + error + "\n\n";
        }
      }
    }
  }
  return result;
}

HoverResult& HoverBuilder::append_comment( Node* node, HoverResult& result )
{
  return append_comment( node->source_location, result );
}
}  // namespace VSCodeEscript::CompilerExt