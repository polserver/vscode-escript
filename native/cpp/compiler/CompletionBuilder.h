#ifndef VSCODEESCRIPT_COMPLETIONBUILDER_H
#define VSCODEESCRIPT_COMPLETIONBUILDER_H

#include "SemanticContextBuilder.h"
#include <optional>
#include <string>
#include <vector>

namespace VSCodeEscript::CompilerExt
{

/**
 * The kind of a completion entry.
 */
enum class CompletionItemKind
{
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
};

struct CompletionItem
{
  std::string label;
  std::optional<CompletionItemKind> kind;
};

class CompletionBuilder : public EscriptGrammar::EscriptParserBaseVisitor
{
public:
  CompletionBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                     const Pol::Bscript::Compiler::Position& position );

  std::vector<CompletionItem> context();

  virtual antlrcpp::Any visitClassDeclaration(
      EscriptGrammar::EscriptParser::ClassDeclarationContext* ctx ) override;
  virtual antlrcpp::Any visitFunctionDeclaration(
      EscriptGrammar::EscriptParser::FunctionDeclarationContext* ctx ) override;

  virtual antlrcpp::Any visitChildren( antlr4::tree::ParseTree* node ) override;

protected:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
  std::vector<antlr4::ParserRuleContext*> nodes;
  std::string calling_scope = "";
  std::string current_user_function = "";
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_COMPLETIONBUILDER_H
