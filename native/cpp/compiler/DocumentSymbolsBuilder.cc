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

  symbol_stack.push_back( Napi::Array::New( env ) );
  workspace.source->accept( *this );

  return scope.Escape( symbol_stack.back() );
}

antlrcpp::Any DocumentSymbolsBuilder::append_symbol( SymbolKind kind,
                                                     antlr4::ParserRuleContext* ctx,
                                                     antlr4::tree::TerminalNode* selectionTerminal )
{
  if ( selectionTerminal != nullptr &&
       selectionTerminal->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    return append_symbol( selectionTerminal->getText(), kind, ctx, selectionTerminal );
  }

  return visitChildren( ctx );
}

antlrcpp::Any DocumentSymbolsBuilder::append_symbol( const std::string& name, SymbolKind kind,
                                                     antlr4::ParserRuleContext* ctx,
                                                     antlr4::tree::TerminalNode* selectionTerminal )
{
  if ( selectionTerminal != nullptr &&
       selectionTerminal->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    Napi::Object symbol = Napi::Object::New( env );
    symbol.Set( "name", name );
    symbol.Set( "kind", static_cast<int>( kind ) );
    symbol.Set( "range", range_to_object( Compiler::Range( *ctx ), env ) );
    symbol.Set( "selectionRange", range_to_object( Compiler::Range( *selectionTerminal ), env ) );

    auto children = Napi::Array::New( env );
    symbol_stack.push_back( children );
    visitChildren( ctx );
    symbol_stack.pop_back();

    if ( children.Length() > 0 )
    {
      symbol.Set( "children", children );
    }

    symbol_stack.back().Set( symbol_stack.back().Length(), symbol );
  }
  else
  {
    visitChildren( ctx );
  }

  return {};
}


antlrcpp::Any DocumentSymbolsBuilder::visitClassDeclaration(
    EscriptGrammar::EscriptParser::ClassDeclarationContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER();
       identifier != nullptr && identifier->getTreeType() != antlr4::tree::ParseTreeType::ERROR )
  {
    current_scope = identifier->getText();
    append_symbol( current_scope, SymbolKind::Class, ctx, identifier );
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
  return append_symbol( SymbolKind::Constant, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitFunctionExpression(
    EscriptGrammar::EscriptParser::FunctionExpressionContext* ctx )
{
  return append_symbol( "<function expression>", SymbolKind::Function, ctx, ctx->AT() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitVariableDeclaration(
    EscriptGrammar::EscriptParser::VariableDeclarationContext* ctx )
{
  return append_symbol( SymbolKind::Variable, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitSequenceBinding(
    EscriptGrammar::EscriptParser::SequenceBindingContext* ctx )
{
  return append_symbol( SymbolKind::Variable, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitIndexBinding(
    EscriptGrammar::EscriptParser::IndexBindingContext* ctx )
{
  if ( ctx->binding() == nullptr )
    return append_symbol( SymbolKind::Variable, ctx, ctx->IDENTIFIER() );

  return visitChildren( ctx );
}

antlrcpp::Any DocumentSymbolsBuilder::visitBinding(
    EscriptGrammar::EscriptParser::BindingContext* ctx )
{
  return append_symbol( SymbolKind::Variable, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitEnumStatement(
    EscriptGrammar::EscriptParser::EnumStatementContext* ctx )
{
  return append_symbol( SymbolKind::Enum, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitEnumListEntry(
    EscriptGrammar::EscriptParser::EnumListEntryContext* ctx )
{
  return append_symbol( SymbolKind::EnumMember, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitModuleFunctionDeclaration(
    EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext* ctx )
{
  return append_symbol( SymbolKind::Function, ctx, ctx->IDENTIFIER() );
}

antlrcpp::Any DocumentSymbolsBuilder::visitProgramDeclaration(
    EscriptGrammar::EscriptParser::ProgramDeclarationContext* ctx )
{
  return append_symbol( SymbolKind::Function, ctx, ctx->IDENTIFIER() );
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

    return append_symbol( function_name, kind, ctx, identifier );
  }

  return visitChildren( ctx );
}

antlrcpp::Any DocumentSymbolsBuilder::visitUninitFunctionDeclaration(
    EscriptGrammar::EscriptParser::UninitFunctionDeclarationContext* ctx )
{
  return append_symbol( SymbolKind::Function, ctx, ctx->IDENTIFIER() );
}
