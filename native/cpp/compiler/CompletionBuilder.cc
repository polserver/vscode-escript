#include "CompletionBuilder.h"

#include "bscript/compiler/ast/ClassDeclaration.h"
#include "bscript/compiler/model/ScopeName.h"

#include "clib/strutil.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
CompletionBuilder::CompletionBuilder( CompilerWorkspace& workspace, const Position& position )
    : workspace( workspace ), position( position )
{
}

std::vector<CompletionItem> CompletionBuilder::context()
{
  if ( !workspace.source )
  {
    return {};
  }

  workspace.source->accept( *this );

  if ( nodes.empty() )
  {
    return {};
  }

  antlr4::Token* result = nullptr;
  antlr4::Token* prev_token = nullptr;
  antlr4::Token* second_prev_token = nullptr;
  auto tokens = workspace.source->get_all_tokens();

  for ( const auto& token : tokens )
  {
    if ( token->getLine() == position.line_number &&
         token->getCharPositionInLine() + 1 <= position.character_column &&
         token->getCharPositionInLine() + 1 + token->getText().length() >=
             position.character_column )
    {
      result = token;
      if ( token->getTokenIndex() > 0 )
      {
        prev_token = tokens[token->getTokenIndex() - 1];
      }
      if ( token->getTokenIndex() > 1 )
      {
        second_prev_token = tokens[token->getTokenIndex() - 2];
      }
      break;
    }
  }

  if ( !result )
  {
    return {};
  }

  ScopeTreeQuery query;

  query.current_user_function = current_user_function;
  query.calling_scope = calling_scope;

  if ( result->getType() == EscriptLexer::IDENTIFIER )
  {
    query.prefix = result->getText();
    if ( prev_token && prev_token->getType() == EscriptLexer::COLONCOLON )
    {
      if ( second_prev_token && second_prev_token->getType() == EscriptLexer::IDENTIFIER )
      {
        query.prefix_scope = second_prev_token->getText();
      }
      else
      {
        query.prefix_scope = ScopeName::Global;
      }
    }
  }
  else if ( result->getType() == EscriptLexer::COLONCOLON )
  {
    if ( prev_token && prev_token->getType() == EscriptLexer::IDENTIFIER )
    {
      query.prefix_scope = prev_token->getText();
    }
    else
    {
      query.prefix_scope = ScopeName::Global;
    }
  }
  else
  {
    return {};
  }

  std::vector<CompletionItem> results;

  for ( auto* constant : workspace.scope_tree.list_constants( query ) )
  {
    results.push_back( CompletionItem{ constant->identifier, CompletionItemKind::Constant } );
  }

  for ( auto variable : workspace.scope_tree.list_variables( query, position ) )
  {
    results.push_back(
        CompletionItem{ variable->scoped_name().name, CompletionItemKind::Variable } );
  }

  for ( auto* user_function : workspace.scope_tree.list_user_functions( query, position ) )
  {
    results.push_back(
        CompletionItem{ user_function->name, user_function->type == UserFunctionType::Constructor
                                                 ? CompletionItemKind::Constructor
                                                 : CompletionItemKind::Function } );
  }

  for ( auto* module_function : workspace.scope_tree.list_module_functions( query ) )
  {
    results.push_back( CompletionItem{ module_function->name, CompletionItemKind::Function } );
  }

  for ( auto& scope_name : workspace.scope_tree.list_scopes( query ) )
  {
    results.push_back( CompletionItem{ scope_name, CompletionItemKind::Class } );
  }

  for ( auto& module_name : workspace.scope_tree.list_modules( query ) )
  {
    results.push_back( CompletionItem{ module_name, CompletionItemKind::Module } );
  }

  return results;
}

antlrcpp::Any CompletionBuilder::visitClassDeclaration(
    EscriptParser::ClassDeclarationContext* ctx )
{
  if ( ctx->IDENTIFIER() )
  {
    Pol::Bscript::Compiler::Range range( *ctx );
    if ( range.contains( position ) )
    {
      calling_scope = ctx->IDENTIFIER()->getText();
    }
  }

  return visitChildren( ctx );
}

antlrcpp::Any CompletionBuilder::visitFunctionDeclaration(
    EscriptGrammar::EscriptParser::FunctionDeclarationContext* ctx )
{
  if ( ctx->IDENTIFIER() )
  {
    Pol::Bscript::Compiler::Range range( *ctx );
    if ( range.contains( position ) )
    {
      current_user_function = ctx->IDENTIFIER()->getText();
    }
  }

  return visitChildren( ctx );
}

antlrcpp::Any CompletionBuilder::visitChildren( antlr4::tree::ParseTree* node )
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