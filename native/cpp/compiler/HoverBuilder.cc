#include "HoverBuilder.h"

#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
HoverBuilder::HoverBuilder( CompilerWorkspace& workspace, const Position& position )
    : workspace( workspace ), position( position )
{
}

std::optional<std::string> HoverBuilder::hover()
{
  if ( workspace.source )
  {
    workspace.source->accept( *this );
  }

  auto parameters_to_string =
      [&]( std::vector<std::reference_wrapper<FunctionParameterDeclaration>> params )
      -> std::string {
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
  };

  while ( !nodes.empty() )
  {
    auto node = nodes.back();
    nodes.pop_back();
    if ( auto* ctx = dynamic_cast<EscriptParser::VariableDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          if ( auto* parent_ctx =
                   dynamic_cast<EscriptParser::ConstStatementContext*>( ctx->parent ) )
          {
            auto name = id->getText();
            std::string result = "(";
            result += "constant) ";
            result += name;
            if ( auto* const_decl = workspace.constants.find( name ) )
            {
              result += " := ";
              result += const_decl->expression().describe();
            }
            return result;
          }
          else
          {
            std::string result = "(";
            result += "variable) ";
            result += id->getText();
            return result;
          }
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::ModuleFunctionDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          std::string result = "(module function) ";
          result += name;
          result += "(";
          if ( auto* function_def = workspace.scope_tree.find_module_function( name ) )
          {
            result += parameters_to_string( function_def->parameters() );
          }
          else
          {
            result += "<unknown parameters>";
          }
          result += ")";
          return result;
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::FunctionDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          std::string result = "(user function) ";
          result += name;
          result += "(";
          if ( auto* function_def = workspace.scope_tree.find_user_function( name ) )
          {
            result += parameters_to_string( function_def->parameters() );
          }
          else
          {
            result += "<unknown parameters>";
          }
          result += ")";
          return result;
        }
      }
    }

    else if ( auto* ctx = dynamic_cast<EscriptParser::ModuleFunctionParameterContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto param_name = id->getText();
          std::string result = "(parameter) ";
          result += param_name;
          if ( auto* parent_ctx = dynamic_cast<EscriptParser::ModuleFunctionDeclarationContext*>(
                   ctx->parent->parent ) )
          {
            if ( auto* parent_id = parent_ctx->IDENTIFIER() )
            {
              auto function_name = parent_id->getSymbol()->getText();
              if ( auto* function_def = workspace.scope_tree.find_module_function( function_name ) )
              {
                for ( const auto& param_ref : function_def->parameters() )
                {
                  auto& param = param_ref.get();
                  if ( param.name == param_name )
                  {
                    if ( auto* default_value = param.default_value() )
                    {
                      result += " := ";
                      result += default_value->describe();
                    }
                    break;
                  }
                }
              }
            }
          }
          return result;
        }
      }
    }
    break;
  }
  return std::nullopt;
}

bool HoverBuilder::contains( antlr4::tree::TerminalNode* terminal )
{
  if ( terminal )
  {
    auto* sym = terminal->getSymbol();
    auto length = sym->getText().length();
    auto line_number = sym->getLine();
    auto character_column = sym->getCharPositionInLine() + 1;
    if ( line_number == position.line_number && character_column <= position.character_column &&
         character_column + length > position.character_column )
      return true;
  }
  return false;
}

antlrcpp::Any HoverBuilder::visitChildren( antlr4::tree::ParseTree* node )
{
  for ( auto* child : node->children )
  {
    if ( auto* ctx = dynamic_cast<antlr4::ParserRuleContext*>( child ) )
    {
      SourceLocation sl( workspace.referenced_source_file_identifiers.front().get(), *ctx );
      if ( sl.contains( position ) )
      {
        nodes.push_back( ctx );
      }
    }
    child->accept( this );
  }

  return antlrcpp::Any();
}

}  // namespace VSCodeEscript::CompilerExt