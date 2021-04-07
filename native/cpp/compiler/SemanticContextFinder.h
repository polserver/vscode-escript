#ifndef VSCODEESCRIPT_SEMANTICCONTEXTFINDER_H
#define VSCODEESCRIPT_SEMANTICCONTEXTFINDER_H

#include "bscript/compiler/ast/NodeVisitor.h"
#include "bscript/compiler/file/SourceLocation.h"
#include <optional>
#include <vector>


namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
}

namespace VSCodeEscript::CompilerExt
{
class SemanticContextFinder : public Pol::Bscript::Compiler::NodeVisitor
{
public:
  SemanticContextFinder( Pol::Bscript::Compiler::CompilerWorkspace&,
                         const Pol::Bscript::Compiler::Position& position );

  ~SemanticContextFinder() override = default;

  std::optional<std::string> hover( const Pol::Bscript::Compiler::Position& );

  void visit_const_declaration( Pol::Bscript::Compiler::ConstDeclaration& ) override;

  void visit_children( Pol::Bscript::Compiler::Node& parent ) override;

private:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
  std::vector<Pol::Bscript::Compiler::Node*> nodes;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_SEMANTICCONTEXTFINDER_H
