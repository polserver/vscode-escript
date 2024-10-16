#ifndef VSCODEESCRIPT_SEMANTICCONTEXTBUILDER_H
#define VSCODEESCRIPT_SEMANTICCONTEXTBUILDER_H

#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/NodeVisitor.h"
#include "bscript/compiler/ast/Program.h"
#include "bscript/compiler/ast/ProgramParameterDeclaration.h"
#include "bscript/compiler/ast/ProgramParameterList.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compiler/model/Variable.h"
#include <EscriptGrammar/EscriptParserBaseVisitor.h>
#include <optional>
#include <vector>

namespace VSCodeEscript::CompilerExt
{
template <typename T>
class SemanticContextBuilder : public EscriptGrammar::EscriptParserBaseVisitor
{
public:
  SemanticContextBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                          const Pol::Bscript::Compiler::Position& position );

  // ~SemanticContextBuilder() override = default;

  std::optional<T> context();

  virtual std::optional<T> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable );
  virtual std::optional<T> get_constant( Pol::Bscript::Compiler::ConstDeclaration* const_decl );
  virtual std::optional<T> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* );
  virtual std::optional<T> get_module_function_parameter(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param );
  virtual std::optional<T> get_user_function( Pol::Bscript::Compiler::UserFunction* );
  virtual std::optional<T> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param );
  virtual std::optional<T> get_program( const std::string& name,
                                        Pol::Bscript::Compiler::Program* program );
  virtual std::optional<T> get_program_parameter( const std::string& name );
  virtual std::optional<T> get_member( const std::string& name );
  virtual std::optional<T> get_include( const std::string& include_name );
  virtual std::optional<T> get_use( const std::string& module_name );
  virtual std::optional<T> get_method( const std::string& name );

  virtual antlrcpp::Any visitChildren( antlr4::tree::ParseTree* node ) override;

  bool contains( antlr4::tree::TerminalNode* terminal );
  bool contains( antlr4::Token* terminal );
  std::optional<T> try_constant( const std::string& name );
  std::optional<T> try_variable( const std::string& name );
  std::optional<T> try_constant_or_variable( const std::string& name );
  std::optional<T> try_function( const std::string& name );
  std::optional<T> try_user_function( const std::string& name );
  std::optional<T> try_module_function( const std::string& name );

protected:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
  std::vector<antlr4::ParserRuleContext*> nodes;
};

template <typename T>
SemanticContextBuilder<T>::SemanticContextBuilder( Pol::Bscript::Compiler::CompilerWorkspace& workspace,
                                                 const Pol::Bscript::Compiler::Position& position )
    : workspace( workspace ), position( position )
{
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_constant(
    Pol::Bscript::Compiler::ConstDeclaration* const_decl )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_module_function(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_module_function_parameter(
    Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_user_function(
    Pol::Bscript::Compiler::UserFunction* )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_user_function_parameter(
    Pol::Bscript::Compiler::UserFunction* function_def,
    Pol::Bscript::Compiler::FunctionParameterDeclaration* param )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_program( const std::string& name,
                                                         Pol::Bscript::Compiler::Program* program )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_program_parameter( const std::string& name )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_member( const std::string& name )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_use( const std::string& module_name )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_include( const std::string& include_name )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::get_method( const std::string& name )
{
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_constant( const std::string& name )
{
  if ( auto* function_def = workspace.scope_tree.find_constant( name ) )
  {
    return get_constant( function_def );
  }
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_variable( const std::string& name )
{
  if ( auto variable = workspace.scope_tree.find_variable( name, position ) )
  {
    return get_variable( variable );
  }
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_constant_or_variable( const std::string& name )
{
  auto result = try_constant( name );
  if ( result.has_value() )
  {
    return result;
  }
  else
  {
    return try_variable( name );
  }
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_user_function( const std::string& name )
{
  if ( auto* function_def = workspace.scope_tree.find_user_function( name ) )
  {
    return get_user_function( function_def );
  }
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_module_function( const std::string& name )
{
  if ( auto* function_def = workspace.scope_tree.find_module_function( name ) )
  {
    return get_module_function( function_def );
  }
  return std::nullopt;
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::try_function( const std::string& name )
{
  auto result = try_module_function( name );
  if ( result.has_value() )
  {
    return result;
  }
  else
  {
    return try_user_function( name );
  }
}

template <typename T>
std::optional<T> SemanticContextBuilder<T>::context()
{
  if ( workspace.source )
  {
    workspace.source->accept( *this );
  }

  while ( !nodes.empty() )
  {
    auto node = nodes.back();
    nodes.pop_back();
    if ( auto* ctx =
             dynamic_cast<EscriptGrammar::EscriptParser::VariableDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          if ( auto variable = workspace.scope_tree.find_variable( name, position ) )
          {
            return get_variable( variable );
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ConstantDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          if ( auto* constant = workspace.scope_tree.find_constant( name ) )
          {
            return get_constant( constant );
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext*>(
                      node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          if ( auto* function_def = workspace.scope_tree.find_module_function( name ) )
          {
            return get_module_function( function_def );
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::FunctionDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          if ( auto* function_def = workspace.scope_tree.find_user_function( name ) )
          {
            return get_user_function( function_def );
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ModuleFunctionParameterContext*>(
                      node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto param_name = id->getText();
          if ( auto* parent_ctx =
                   dynamic_cast<EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext*>(
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
                  if ( param.name.name == param_name )
                  {
                    return get_module_function_parameter( function_def, &param );
                  }
                }
              }
            }
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ForeachIterableExpressionContext*>(
                      node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ForeachStatementContext*>( node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::EnumListEntryContext*>( node ) )
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
    else if ( auto* ctx = dynamic_cast<EscriptGrammar::EscriptParser::SwitchLabelContext*>( node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::BasicForStatementContext*>( node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ProgramDeclarationContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) && workspace.program )
        {
          auto name = id->getSymbol()->getText();
          return get_program( name, workspace.program.get() );
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::ProgramParameterContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) && workspace.program )
        {
          auto name = id->getSymbol()->getText();
          return get_program_parameter( name );
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::FunctionParameterContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto param_name = id->getText();
          if ( auto* parent_ctx =
                   dynamic_cast<EscriptGrammar::EscriptParser::FunctionDeclarationContext*>(
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
                  if ( param.name.name == param_name )
                  {
                    return get_user_function_parameter( function_def, &param );
                  }
                }
              }
            }
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::FunctionReferenceContext*>( node ) )
    {
      if ( auto* id = ctx->function )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return try_user_function( name );
        }
      }
    }
    else if ( auto* ctx = dynamic_cast<EscriptGrammar::EscriptParser::PrimaryContext*>( node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::NavigationSuffixContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return get_member( name );
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::MethodCallSuffixContext*>( node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return get_method( name );
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::FunctionCallContext*>( node ) )
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
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::StructInitializerExpressionContext*>(
                      node ) )
    {
      if ( auto* id = ctx->IDENTIFIER() )
      {
        if ( contains( id ) )
        {
          auto name = id->getText();
          return get_member( name );
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::IncludeDeclarationContext*>( node ) )
    {
      if ( auto* stringIdentifier = ctx->stringIdentifier() )
      {
        if ( auto string_literal = stringIdentifier->STRING_LITERAL() )
        {
          if ( contains( string_literal ) )
          {
            return get_include(
                string_literal->getText().substr( 1, string_literal->getText().length() - 2 ) );
          }
        }
        else if ( auto identifier = stringIdentifier->IDENTIFIER() )
        {
          if ( contains( identifier ) )
          {
            return get_include( identifier->getText() );
          }
        }
      }
    }
    else if ( auto* ctx =
                  dynamic_cast<EscriptGrammar::EscriptParser::UseDeclarationContext*>( node ) )
    {
      if ( auto* stringIdentifier = ctx->stringIdentifier() )
      {
        if ( auto string_literal = stringIdentifier->STRING_LITERAL() )
        {
          if ( contains( string_literal ) )
          {
            return get_use(
                string_literal->getText().substr( 1, string_literal->getText().length() - 2 ) );
          }
        }
        else if ( auto identifier = stringIdentifier->IDENTIFIER() )
        {
          if ( contains( identifier ) )
          {
            return get_use( identifier->getText() );
          }
        }
      }
    }
  }
  return std::nullopt;
}

template <typename T>
bool SemanticContextBuilder<T>::contains( antlr4::Token* sym )
{
  if ( sym )
  {
    auto length = sym->getText().length();
    auto line_number = sym->getLine();
    auto character_column = sym->getCharPositionInLine() + 1;
    if ( line_number == position.line_number && character_column <= position.character_column &&
         character_column + length > position.character_column )
      return true;
  }
  return false;
}

template <typename T>
bool SemanticContextBuilder<T>::contains( antlr4::tree::TerminalNode* terminal )
{
  if ( terminal )
  {
    auto* sym = terminal->getSymbol();
    return contains( sym );
  }
  return false;
}

template <typename T>
antlrcpp::Any SemanticContextBuilder<T>::visitChildren( antlr4::tree::ParseTree* node )
{
  for ( auto* child : node->children )
  {
    if ( auto* ctx = dynamic_cast<antlr4::ParserRuleContext*>( child ) )
    {
      Pol::Bscript::Compiler::Range range( *ctx );
      if ( range.contains( position ) )
      {
        nodes.push_back( ctx );
      }
    }
    child->accept( this );
  }

  return antlrcpp::Any();
}

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_SEMANTICCONTEXTBUILDER_H
