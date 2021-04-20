#include "HoverBuilder.h"

#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/Program.h"
#include "bscript/compiler/ast/ProgramParameterDeclaration.h"
#include "bscript/compiler/ast/ProgramParameterList.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compiler/model/Variable.h"

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

  auto program_parameters_to_string =
      [&]( Pol::Bscript::Compiler::ProgramParameterList& params ) -> std::string {
    bool added = false;
    std::string result;
    for ( const auto& param_ref : params.children )
    {
      if ( auto* param = dynamic_cast<Pol::Bscript::Compiler::ProgramParameterDeclaration*>(
               param_ref.get() ) )
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
    return result;
  };

  auto try_constant = [&]( const std::string& name ) -> std::optional<std::string> {
    if ( auto* const_decl = workspace.scope_tree.find_constant( name ) )
    {
      std::string result = "(constant) ";
      result += const_decl->identifier;
      result += " := ";
      result += const_decl->expression().describe();
      return result;
    }
    return std::nullopt;
  };

  auto try_variable = [&]( const std::string& name ) -> std::optional<std::string> {
    if ( auto variable = workspace.scope_tree.find_variable( name, position ) )
    {
      std::string result = "(variable) ";
      result += variable->name;
      return result;
    }
    return std::nullopt;
  };

  auto try_constant_or_variable = [&]( const std::string& name ) -> std::optional<std::string> {
    auto result = try_constant( name );
    if ( result.has_value() )
    {
      return result;
    }
    else
    {
      return try_variable( name );
    }
  };


  auto try_module_function = [&]( const std::string& name ) -> std::optional<std::string> {
    if ( auto* function_def = workspace.scope_tree.find_module_function( name ) )
    {
      std::string result = "(module function) ";
      result += function_def->name;
      result += "(";
      result += parameters_to_string( function_def->parameters() );
      result += ")";
      return result;
    }
    return std::nullopt;
  };

  auto try_user_function = [&]( const std::string& name ) -> std::optional<std::string> {
    if ( auto* function_def = workspace.scope_tree.find_user_function( name ) )
    {
      std::string result = "(user function) ";
      result += function_def->name;
      result += "(";
      result += parameters_to_string( function_def->parameters() );
      result += ")";
      return result;
    }
    return std::nullopt;
  };

  auto try_function = [&]( const std::string& name ) -> std::optional<std::string> {
    auto result = try_module_function( name );
    if ( result.has_value() )
    {
      return result;
    }
    else
    {
      return try_user_function( name );
    }
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
          auto name = id->getText();
          return try_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::ConstantDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return try_constant( name );
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
          return try_module_function( name );
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
          return try_user_function( name );
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
    else if ( auto* ctx = dynamic_cast<EscriptParser::ForeachIterableExpressionContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getSymbol()->getText();
          return try_constant_or_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::ForeachStatementContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getSymbol()->getText();
          return try_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::EnumListEntryContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getSymbol()->getText();
          return try_constant( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::SwitchLabelContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getSymbol()->getText();
          return try_constant_or_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::BasicForStatementContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getSymbol()->getText();
          return try_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::ProgramDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) && workspace.program )
        {
          auto name = id->getSymbol()->getText();
          std::string result = "(program) ";
          result += name;
          result += "(";
          result += program_parameters_to_string( workspace.program->parameter_list() );
          result += ")";
          return result;
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::ProgramParameterContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto param_name = id->getText();
          std::string result = "(program parameter) ";
          result += param_name;
          return result;
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::FunctionParameterContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto param_name = id->getText();
          std::string result = "(parameter) ";
          result += param_name;
          if ( auto* parent_ctx = dynamic_cast<EscriptParser::FunctionDeclarationContext*>(
                   ctx->parent->parent->parent ) )
          {
            if ( auto* parent_id = parent_ctx->IDENTIFIER() )
            {
              auto function_name = parent_id->getSymbol()->getText();
              if ( auto* function_def = workspace.scope_tree.find_user_function( function_name ) )
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
    else if ( auto* ctx = dynamic_cast<EscriptParser::FunctionReferenceContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return try_user_function( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::PrimaryContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return try_constant_or_variable( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::NavigationSuffixContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          std::string result = "(member) ";
          result += name;
          return result;
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::MethodCallSuffixContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          std::string result = "(method) ";
          result += name;
          return result;
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::FunctionCallContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return try_function( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptParser::StructInitializerExpressionContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          std::string result = "(member) ";
          result += name;
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