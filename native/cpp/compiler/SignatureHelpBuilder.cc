#include "SignatureHelpBuilder.h"

#include "../misc/XmlDocParser.h"
#include "../napi/LSPWorkspace.h"
#include "HoverBuilder.h"

#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/UserFunction.h"
#include <boost/range/adaptor/sliced.hpp>
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
    size_t active_parameter, ModuleFunctionDeclaration* function_def, bool skip_first_param )
{
  bool added = false;
  std::string result = function_name + "(";
  std::unique_ptr<XmlDocParser> parsed;
  std::vector<SignatureHelpParameter> parameters;
  parameters.reserve( params.size() );

  size_t current_position = result.size();

  if ( function_def != nullptr )
  {
    auto pathname = function_def->scope + ".em";
    auto xmlDoc = lsp_workspace->get_xml_doc_path( pathname );
    if ( xmlDoc.has_value() )
      parsed = XmlDocParser::parse_function( xmlDoc.value(), function_name );
  }

  for ( const auto& param_ref :
        params | boost::adaptors::sliced( skip_first_param ? 1 : 0, params.size() ) )
  {
    auto& param = param_ref.get();
    if ( added )
    {
      result += ", ";
      current_position += 2;
    }
    else
    {
      result += " ";
      current_position += 1;
      added = true;
    }
    result += param.name.name;

    std::string documentation;
    if ( parsed )
    {
      auto iter = std::find_if( parsed->parameters.begin(), parsed->parameters.end(),
                                [&]( const auto& p ) { return param.name.name == p.name; } );

      if ( iter != parsed->parameters.end() )
      {
        documentation = iter->value;
      }
    }

    parameters.push_back( SignatureHelpParameter{
        current_position, current_position + param.name.name.size(), documentation } );
    current_position += param.name.name.size();

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

  if ( added )
  {
    result += " ";
  }

  result += ")";
  return SignatureHelp{ result, std::move( parameters ), active_parameter };
}

std::optional<SignatureHelp> SignatureHelpBuilder::context()
{
  if ( workspace.source )
  {
    auto tokens = workspace.source->get_all_tokens();
    bool in_class = false;

    ScopeTreeQuery query;

    antlr4::Token* token;
    // Loop the source from the end to find the token containing our position
    for ( auto rit = tokens.rbegin(); rit != tokens.rend(); ++rit )
    {
      token = *rit;
      Pol::Bscript::Compiler::Range range( token );

      // Since we are going in reverse, finding an ENDCLASS token means we are _in_ a class.
      if ( token->getType() == EscriptLexer::ENDCLASS )
      {
        in_class = true;
      }
      // Similarly, finding a CLASS token means we are _outside_ a class.
      else if ( token->getType() == EscriptLexer::CLASS )
      {
        in_class = false;
      }

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
                token = *rit;
                if ( token->getType() == EscriptLexer::IDENTIFIER )
                {
                  auto function_name = token->getText();

                  query.prefix = function_name;

                  // Check for a scoped call
                  if ( token->getTokenIndex() > 0 &&
                       tokens[token->getTokenIndex() - 1]->getType() == EscriptLexer::COLONCOLON )
                  {
                    if ( token->getTokenIndex() > 1 &&
                         tokens[token->getTokenIndex() - 2]->getType() == EscriptLexer::IDENTIFIER )
                    {
                      query.prefix_scope = tokens[token->getTokenIndex() - 2]->getText();
                    }
                    else
                    {
                      query.prefix_scope = ScopeName::Global;
                    }
                  }

                  break;
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
        } while ( rit != tokens.rend() && ( token = *rit ) );

        if ( query.prefix.empty() )
        {
          return {};
        }

        if ( in_class && rit != tokens.rend() )
        {
          // If in a class, we need to find the class name to get the calling
          // scope. We do this by continuing to move the reverse iterator `rit`
          // toward the beginning of the source, looking for the CLASS token.
          antlr4::Token* class_token = nullptr;
          for ( ; rit != tokens.rend(); ++rit )
          {
            token = *rit;
            if ( token->getType() == EscriptLexer::CLASS )
            {
              class_token = token;
              break;
            }
          }

          // Then, we find the next non-whitespace token after the CLASS token,
          // which is the class name if an IDENTIFIER.
          if ( class_token && class_token->getTokenIndex() < tokens.size() - 1 )
          {
            for ( auto it = tokens.begin() + class_token->getTokenIndex() + 1; it < tokens.end();
                  ++it )
            {
              auto forward_token = *it;
              if ( forward_token->getType() == EscriptLexer::WS )
              {
                continue;
              }

              if ( forward_token->getType() == EscriptLexer::IDENTIFIER )
              {
                query.calling_scope = forward_token->getText();
              }

              break;
            }
          }
        }

        if ( auto* module_function = workspace.scope_tree.find_module_function( query ) )
        {
          return make_signature_help( _lsp_workspace, module_function->name,
                                      module_function->parameters(), current_param, module_function,
                                      false );
        }
        else if ( auto* user_function = workspace.scope_tree.find_user_function( query ) )
        {
          bool skip_first_param = user_function->type == UserFunctionType::Constructor ||
                                  user_function->type == UserFunctionType::Super;

          return make_signature_help( _lsp_workspace, user_function->name,
                                      user_function->parameters(), current_param, nullptr,
                                      skip_first_param );
        }

        // No need to continue trying anything else, as the best-effort above failed.
        return {};
      }
    }
  }
  return {};
}

}  // namespace VSCodeEscript::CompilerExt