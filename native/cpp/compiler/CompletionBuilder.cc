#include "CompletionBuilder.h"

#include <set>

#include "bscript/compiler/ast/ClassDeclaration.h"
#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/MemberAssignment.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compiler/model/ScopeName.h"
#include "bscript/compiler/model/ScopeTree.h"
#include "bscript/compiler/model/Variable.h"
#include <EscriptGrammar/EscriptLexer.h>

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

  antlr4::Token* result = nullptr;
  antlr4::Token* prev_token = nullptr;
  antlr4::Token* second_prev_token = nullptr;
  auto tokens = workspace.source->get_all_tokens();

  bool waiting_for_function = false;
  bool waiting_for_class = false;
  bool in_enum = false;

  for ( const auto& token : tokens )
  {
    if ( token->getType() == EscriptLexer::CLASS )
    {
      waiting_for_class = true;
    }
    else if ( token->getType() == EscriptLexer::ENUM )
    {
      in_enum = true;
    }
    else if ( token->getType() == EscriptLexer::ENDENUM )
    {
      in_enum = false;
    }
    else if ( token->getType() == EscriptLexer::FUNCTION )
    {
      waiting_for_function = true;
    }
    else if ( token->getType() == EscriptLexer::ENDCLASS )
    {
      calling_scope = "";
    }
    else if ( token->getType() == EscriptLexer::ENDFUNCTION )
    {
      current_user_function = "";
    }
    else if ( waiting_for_class )
    {
      if ( token->getType() == EscriptLexer::IDENTIFIER )
      {
        waiting_for_class = false;
        calling_scope = token->getText();
      }
      else if ( token->getType() != EscriptLexer::WS )
      {
        waiting_for_class = false;
      }
    }
    else if ( waiting_for_function )
    {
      if ( token->getType() == EscriptLexer::IDENTIFIER )
      {
        waiting_for_function = false;
        current_user_function = token->getText();
      }
      else if ( token->getType() != EscriptLexer::WS )
      {
        waiting_for_function = false;
      }
    }

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
  bool is_object_access_query = false;
  bool is_class_query = false;

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
    else if ( prev_token && prev_token->getType() == EscriptLexer::DOT )
    {
      if ( second_prev_token && second_prev_token->getType() == EscriptLexer::IDENTIFIER )
      {
        is_object_access_query = true;
        if ( Pol::Clib::caseInsensitiveEqual( second_prev_token->getText(), "this" ) )
        {
          is_class_query = true;
        }
      }
      else
      {
        return {};
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
  else if ( result->getType() == EscriptLexer::DOT )
  {
    if ( prev_token && prev_token->getType() == EscriptLexer::IDENTIFIER )
    {
      is_object_access_query = true;
      if ( Pol::Clib::caseInsensitiveEqual( prev_token->getText(), "this" ) )
      {
        is_class_query = true;
      }
    }
    else
    {
      return {};
    }
  }
  else
  {
    return {};
  }

  std::vector<CompletionItem> results;

  if ( is_object_access_query )
  {
    if ( is_class_query )
    {
      for ( auto* user_function : workspace.scope_tree.list_class_methods( query ) )
      {
        results.push_back( CompletionItem{ user_function->name, CompletionItemKind::Method } );
      }
      for ( auto* assignment_statement : workspace.scope_tree.list_class_members( query ) )
      {
        results.push_back(
            CompletionItem{ assignment_statement->name, CompletionItemKind::Field } );
      }
    }
  }
  else
  {
    if ( in_enum && !calling_scope.empty() )
    {
      // Keeps track of constants added for this calling scope, since they are
      // added with no prefix. If we end up adding a globally-scoped constant
      // with the same name, we need to prefix it with `::`. Global constants
      // are _after_ scoped constants in `ScopeTree::list_constants()`.
      std::set<std::string> calling_scope_consts;

      for ( auto* constant : workspace.scope_tree.list_constants( query ) )
      {
        if ( !constant->name.scope.global() )
        {
          results.push_back( CompletionItem{ constant->name.name, CompletionItemKind::Constant } );

          calling_scope_consts.insert( constant->name.name );
        }
        else
        {
          // If we've added a constant with this name already, we need to prefix
          // it with `::` to signal it is global scope.
          std::string prefix =
              calling_scope_consts.find( constant->name.name ) != calling_scope_consts.end() ? "::"
                                                                                             : "";
          results.push_back(
              CompletionItem{ prefix + constant->name.name, CompletionItemKind::Constant } );
        }
      }
    }
    // Not in an enum, no need to worry about scoping, just add all the constants.
    else
    {
      for ( auto* constant : workspace.scope_tree.list_constants( query ) )
      {
        results.push_back(
            CompletionItem{ constant->name.string(), CompletionItemKind::Constant } );
      }
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
  }

  return results;
}
}  // namespace VSCodeEscript::CompilerExt