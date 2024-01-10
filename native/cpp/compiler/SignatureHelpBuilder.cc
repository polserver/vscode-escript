#include "SignatureHelpBuilder.h"

#include "../misc/XmlDocParser.h"
#include "../napi/LSPWorkspace.h"
#include "HoverBuilder.h"

#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/UserFunction.h"
#include <stack>

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
SignatureHelpBuilder::SignatureHelpBuilder( LSPWorkspace* lsp_workspace,
                                            CompilerWorkspace& workspace, const Position& position )
    : _lsp_workspace( lsp_workspace ), workspace( workspace ), position( position )
{
}

SignatureHelp make_signature_help(
    LSPWorkspace* lsp_workspace, const std::string& function_name,
    std::vector<std::reference_wrapper<FunctionParameterDeclaration>> params,
    size_t active_parameter, ModuleFunctionDeclaration* function_def )
{
  bool added = false;
  std::string result = function_name + "(";
  std::unique_ptr<XmlDocParser> parsed;
  std::vector<SignatureHelpParameter> parameters;
  parameters.reserve( params.size() );

  size_t current_position = result.size();

  if ( function_def != nullptr )
  {
    auto pathname = function_def->module_name + ".em";
    auto xmlDoc = lsp_workspace->get_xml_doc_path( pathname );
    if ( xmlDoc.has_value() )
      parsed = XmlDocParser::parse_function( xmlDoc.value(), function_name );
  }

  for ( const auto& param_ref : params )
  {
    auto& param = param_ref.get();
    if ( added )
    {
      result += ", ";
      current_position += 2;
    }
    else
    {
      added = true;
    }
    result += param.name;

    std::string documentation;
    if ( parsed )
    {
      auto iter = std::find_if( parsed->parameters.begin(), parsed->parameters.end(),
                                [&]( const auto& p ) { return param.name == p.name; } );

      if ( iter != parsed->parameters.end() )
      {
        documentation = iter->value;
      }
    }

    parameters.push_back( SignatureHelpParameter{
        current_position, current_position + param.name.size(), documentation } );
    current_position += param.name.size();

    auto* default_value = param.default_value();
    if ( default_value )
    {
      auto default_description = default_value->describe();
      result += " := ";
      auto default_description_formatted =
          HoverBuilder::replace_literal_tags( default_description );
      result += default_description_formatted;
      current_position += default_description_formatted.size() + 4;
    }
  }
  result += ")";
  return SignatureHelp{ result, std::move( parameters ), active_parameter };
}

std::optional<SignatureHelp> SignatureHelpBuilder::context()
{
  if ( workspace.source )
  {
    auto tokens = workspace.source->get_all_tokens();

    antlr4::Token* token;
    // Loop the source from the end to find the token containing our position
    for ( auto rit = tokens.rbegin(); rit != tokens.rend(); ++rit )
    {
      token = rit->get();
      Pol::Bscript::Compiler::Range range( token );

      // We found the token
      if ( range.contains( position ) )
      {
        // Holds parameter counts for nested function calls
        std::stack<size_t> param_counts;
        // Current parameter
        size_t current_param = 0;

        do
        {
          // A comma: increase parameter count
          if ( token->getType() == EscriptLexer::COMMA )
          {
            ++current_param;
          }
          // An open parenthesis: either...
          else if ( token->getType() == EscriptLexer::LPAREN )
          {
            // We have no inner function calls
            if ( param_counts.empty() )
            {
              // Get the identifier before this last open parenthesis
              if ( ++rit != tokens.rend() )
              {
                token = rit->get();
                if ( token->getType() == EscriptLexer::IDENTIFIER )
                {
                  auto function_name = token->getText();
                  if ( auto* module_function =
                           workspace.scope_tree.find_module_function( function_name ) )
                  {
                    return make_signature_help( _lsp_workspace, module_function->name,
                                                module_function->parameters(), current_param,
                                                module_function );
                  }
                  else if ( auto* user_function =
                                workspace.scope_tree.find_user_function( function_name ) )
                  {
                    return make_signature_help( _lsp_workspace, user_function->name,
                                                user_function->parameters(), current_param,
                                                nullptr );
                  }
                }
              }

              // No need to continue trying anything else, as the best-effort above failed.
              return {};
            }
            else
            {
              current_param = param_counts.top();
              param_counts.pop();
            }
          }
          else if ( token->getType() == EscriptLexer::RPAREN )
          {
            param_counts.push( current_param );
            current_param = 0;
          }
          // FIXME improvement add other checks to bail-out fast, eg `if` cannot occur here.
          ++rit;
        } while ( rit != tokens.rend() && ( token = rit->get() ) );

        // No need to continue trying anything else, as the token was in range but everything failed
        return {};
      }
    }
  }
  return {};
}

}  // namespace VSCodeEscript::CompilerExt