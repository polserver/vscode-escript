#include "HoverBuilder.h"
#include "../napi/LSPWorkspace.h"

#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "clib/strutil.h"

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

std::optional<HoverResult> HoverBuilder::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  std::string hover = "```\n(constant) ";
  hover += const_decl->identifier;
  hover += " := ";
  hover += const_decl->expression().describe();
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::CONSTANT, const_decl->identifier, hover };
  return append_comment( const_decl, result );
}

std::optional<HoverResult> HoverBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  std::string hover = "```(variable) ";
  hover += variable->name;
  HoverResult result{ HoverResult::SymbolType::VARIABLE, variable->name, hover };
  hover += "```";
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
  std::string hover = "```\n(module function) ";
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
  std::string hover = "```\n(user function) ";
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
  std::string hover = "```\n(program) ";
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
  std::string hover = "```\n(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += default_value->describe();
  }
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::MODULE_FUNCTION_PARAMETER, param->name, hover };
  return append_comment( function_def, result );
}


std::optional<HoverResult> HoverBuilder::get_user_function_parameter(
    Pol::Bscript::Compiler::UserFunction* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  std::string hover = "```\n(parameter) ";
  hover += param->name;
  if ( auto* default_value = param->default_value() )
  {
    hover += " := ";
    hover += default_value->describe();
  }
  hover += "\n```";
  HoverResult result{ HoverResult::SymbolType::USER_FUNCTION_PARAMETER, param->name, hover };
  return append_comment( param, result );
}

std::optional<HoverResult> HoverBuilder::get_program_parameter( const std::string& name )
{
  std::string hover = "```\n(program parameter) ";
  hover += name;
  hover += "\n```";
  // TODO get comments on program parameters
  return HoverResult{ HoverResult::SymbolType::PROGRAM_PARAMETER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_member( const std::string& name )
{
  std::string hover = "```\n(member) ";
  hover += name;
  hover += "\n```";
  return HoverResult{ HoverResult::SymbolType::MEMBER, name, hover };
}

std::optional<HoverResult> HoverBuilder::get_method( const std::string& name )
{
  std::string hover = "```\n(method) ";
  hover += name;
  hover += "\n```";
  return HoverResult{ HoverResult::SymbolType::METHOD, name, hover };
}

std::string get_explain_string( TiXmlNode* node )
{
  std::string result;

  for ( node = node->FirstChild(); node != nullptr; node = node->NextSibling() )
  {
    if ( node->Type() == TiXmlNode::TINYXML_TEXT )
    {
      result += node->ValueStr() + "\n";
    }
    else if ( node->Type() == TiXmlNode::TINYXML_ELEMENT && node->ValueStr() == "code" )
    {
      auto* codeText = node->FirstChild();

      if ( codeText != nullptr && codeText->Type() == TiXmlNode::TINYXML_TEXT )
      {
        result += "```\n" + Pol::Clib::strtrim( codeText->ValueStr() ) + "\n```\n\n";
      }
    }
  }
  return result;
}

HoverResult& HoverBuilder::append_comment( const SourceLocation& source_location,
                                           HoverResult& result )
{
  std::string comment = "";
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

  if ( result.type == HoverResult::SymbolType::MODULE_FUNCTION )
  {
    auto xmlDoc = _lsp_workspace->get_xml_doc_path( pathname );
    if ( xmlDoc.has_value() )
    {
      TiXmlDocument file;
      file.SetCondenseWhiteSpace( false );
      if ( !file.LoadFile( xmlDoc.value() ) )
        return result;


      auto* node = file.FirstChild( "ESCRIPT" );
      if ( !node )
        return result;

      TiXmlElement* functionNode = node->FirstChildElement( "function" );
      while ( functionNode )
      {
        auto* functName = functionNode->Attribute( "name" );

        if ( result.symbol == functName )
        {
          result.hover += "\n\n";

          for ( auto* child = functionNode->FirstChildElement(); child != nullptr;
                child = child->NextSiblingElement() )
          {
            if ( child->ValueStr() == "explain" )
            {
              result.hover += get_explain_string( child );
            }
            else if ( child->ValueStr() == "return" )
            {
            }
            else if ( child->ValueStr() == "error" )
            {
            }
            else if ( child->ValueStr() == "parameter" )
            {
            }
          }

          // for ( const auto& explain : get_nodes_text( functionNode, "explain" ) )
          // {
          //   result.hover += "\n" + explain;
          // }

          // auto returns = get_nodes_text( functionNode, "return" );
          // if ( !returns.empty() )
          // {
          //   result.hover += "\n\n_Returns_:";
          //   for ( const auto& returnExpl : returns )
          //   {
          //     result.hover += "\n - " + returnExpl;
          //   }
          // }
          // auto errors = get_nodes_text( functionNode, "error" );
          // if ( !errors.empty() )
          // {
          //   result.hover += "\n\n_Errors_:";
          //   for ( const auto& errorExpl : errors )
          //   {
          //     result.hover += "\n - " + errorExpl;
          //   }
          // }

          break;
        }

        functionNode = functionNode->NextSiblingElement( "function" );
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