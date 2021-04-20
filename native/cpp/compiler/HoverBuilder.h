#ifndef VSCODEESCRIPT_HOVERBUILDER_H
#define VSCODEESCRIPT_HOVERBUILDER_H

#include "bscript/compiler/ast/NodeVisitor.h"
#include "bscript/compiler/file/SourceLocation.h"

#include <EscriptGrammar/EscriptParserBaseVisitor.h>
#include <optional>
#include <vector>


namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
}

namespace VSCodeEscript::CompilerExt
{
class HoverBuilder : public EscriptGrammar::EscriptParserBaseVisitor
{
public:
  HoverBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                         const Pol::Bscript::Compiler::Position& position );

  ~HoverBuilder() override = default;

  std::optional<std::string> hover();
  virtual antlrcpp::Any visitChildren( antlr4::tree::ParseTree *node ) override;
  bool contains( antlr4::tree::TerminalNode* terminal );

private:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
  std::vector<antlr4::ParserRuleContext*> nodes;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_HOVERBUILDER_H
