#pragma once

#include <EscriptGrammar/EscriptParserBaseVisitor.h>
#include <ParserRuleContext.h>
#include <napi.h>
#include <optional>
#include <string>
#include <vector>

namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
class Range;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript::CompilerExt
{
enum class SymbolKind : int
{
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
};

class DocumentSymbolsBuilder : public EscriptGrammar::EscriptParserBaseVisitor
{
public:
  DocumentSymbolsBuilder( Napi::Env env, Pol::Bscript::Compiler::CompilerWorkspace& );

  Napi::Value symbols();

  virtual antlrcpp::Any visitBinding( EscriptGrammar::EscriptParser::BindingContext* ctx ) override;
  virtual antlrcpp::Any visitClassDeclaration(
      EscriptGrammar::EscriptParser::ClassDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitConstantDeclaration(
      EscriptGrammar::EscriptParser::ConstantDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitEnumListEntry(
      EscriptGrammar::EscriptParser::EnumListEntryContext* ctx ) override;
  virtual antlrcpp::Any visitEnumStatement(
      EscriptGrammar::EscriptParser::EnumStatementContext* ctx ) override;
  virtual antlrcpp::Any visitFunctionDeclaration(
      EscriptGrammar::EscriptParser::FunctionDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitFunctionExpression(
      EscriptGrammar::EscriptParser::FunctionExpressionContext* ctx ) override;
  virtual antlrcpp::Any visitIndexBinding(
      EscriptGrammar::EscriptParser::IndexBindingContext* ctx ) override;
  virtual antlrcpp::Any visitModuleFunctionDeclaration(
      EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitProgramDeclaration(
      EscriptGrammar::EscriptParser::ProgramDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitSequenceBinding(
      EscriptGrammar::EscriptParser::SequenceBindingContext* ctx ) override;
  virtual antlrcpp::Any visitVariableDeclaration(
      EscriptGrammar::EscriptParser::VariableDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitUninitFunctionDeclaration(
      EscriptGrammar::EscriptParser::UninitFunctionDeclarationContext* ctx ) override;

private:
  antlrcpp::Any append_symbol( const std::string& name, SymbolKind kind,
                               antlr4::ParserRuleContext* ctx,
                               antlr4::tree::TerminalNode* selectionTerminal );
  antlrcpp::Any append_symbol( SymbolKind kind, antlr4::ParserRuleContext* ctx,
                               antlr4::tree::TerminalNode* selectionTerminal );

  Napi::Env env;
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  std::vector<Napi::Array> symbol_list;
  std::string current_scope;
};
}  // namespace VSCodeEscript::CompilerExt
