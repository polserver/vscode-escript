#include "DocumentSymbolsBuilder.h"

#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "clib/strutil.h"
#include <tree/ParseTreeType.h>


using namespace VSCodeEscript::CompilerExt;
using namespace Pol::Bscript;

Napi::Object range_to_object( const Compiler::Range& range, Napi::Env env )
{
  auto obj = Napi::Object::New( env );
  auto rangeStart = Napi::Object::New( env );
  auto rangeEnd = Napi::Object::New( env );

  rangeStart["line"] = range.start.line_number - 1;
  rangeStart["character"] = range.start.character_column - 1;
  obj["start"] = rangeStart;
  rangeEnd["line"] = range.end.line_number - 1;
  rangeEnd["character"] = range.end.character_column - 1;
  obj["end"] = rangeEnd;

  return obj;
}

DocumentSymbolsBuilder::DocumentSymbolsBuilder(
    Napi::Env env, Pol::Bscript::Compiler::CompilerWorkspace& workspace )
    : env( env ), workspace( workspace )
{
}

Napi::Value DocumentSymbolsBuilder::symbols()
{
  Napi::EscapableHandleScope scope( env );

  symbol_list.push_back( Napi::Array::New( env ) );
  workspace.source->accept( *this );

  return scope.Escape( symbol_list.back() );
}

void DocumentSymbolsBuilder::append_symbol( const std::string& name, SymbolKind kind,
                                            antlr4::ParserRuleContext* ctx,
                                            Compiler::Range selectionRange )
{
  Napi::Object symbol = Napi::Object::New( env );
  symbol.Set( "name", name );
  symbol.Set( "kind", static_cast<int>( kind ) );
  symbol.Set( "range", range_to_object( Compiler::Range( *ctx ), env ) );
  symbol.Set( "selectionRange", range_to_object( selectionRange, env ) );

  auto children = Napi::Array::New( env );
  symbol_list.push_back( children );
  visitChildren( ctx );
  symbol_list.pop_back();

  if ( children.Length() > 0 )
  {
    symbol.Set( "children", children );
  }

  symbol_list.back().Set( symbol_list.back().Length(), symbol );
}

antlrcpp::Any DocumentSymbolsBuilder::visitClassDeclaration(
    EscriptGrammar::EscriptParser::ClassDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    current_scope = identifier->getText();
    append_symbol( current_scope, SymbolKind::Class, ctx, Compiler::Range( *identifier ) );
    current_scope.clear();
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitConstantDeclaration(
    EscriptGrammar::EscriptParser::ConstantDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Constant, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitFunctionExpression(
    EscriptGrammar::EscriptParser::FunctionExpressionContext* ctx )
{
  if ( auto at = ctx->AT();
       at != nullptr && at->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( "<function expression>", SymbolKind::Function, ctx, Compiler::Range( *at ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitVariableDeclaration(
    EscriptGrammar::EscriptParser::VariableDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Variable, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitSequenceBinding(
    EscriptGrammar::EscriptParser::SequenceBindingContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Variable, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitIndexBinding(
    EscriptGrammar::EscriptParser::IndexBindingContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       ctx->binding() == nullptr && identifier != nullptr &&
       identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Variable, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitBinding(
    EscriptGrammar::EscriptParser::BindingContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Variable, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitEnumStatement(
    EscriptGrammar::EscriptParser::EnumStatementContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Enum, ctx, Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitEnumListEntry(
    EscriptGrammar::EscriptParser::EnumListEntryContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::EnumMember, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitModuleFunctionDeclaration(
    EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Function, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitFunctionDeclaration(
    EscriptGrammar::EscriptParser::FunctionDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    SymbolKind kind = SymbolKind::Function;

    auto function_name = identifier->getText();
    if ( auto params = ctx->functionParameters() )
    {
      if ( auto params_list = params->functionParameterList() )
      {
        if ( auto param = params_list->functionParameter( 0 ) )
        {
          if ( auto param_id = param->IDENTIFIER() )
          {
            if ( !current_scope.empty() &&
                 Pol::Clib::caseInsensitiveEqual( param_id->getText(), "this" ) )
            {
              if ( Pol::Clib::caseInsensitiveEqual( function_name, current_scope ) )
              {
                kind = SymbolKind::Constructor;
              }
              else
              {
                kind = SymbolKind::Method;
              }
            }
          }
        }
      }
    }

    append_symbol( function_name, kind, ctx, Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}

antlrcpp::Any DocumentSymbolsBuilder::visitUninitFunctionDeclaration(
    EscriptGrammar::EscriptParser::UninitFunctionDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    append_symbol( identifier->getText(), SymbolKind::Function, ctx,
                   Compiler::Range( *identifier ) );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}
