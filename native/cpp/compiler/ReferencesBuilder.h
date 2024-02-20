#ifndef VSCODEESCRIPT_REFERENCESBUILDER_H
#define VSCODEESCRIPT_REFERENCESBUILDER_H

#include "SemanticContextBuilder.h"

namespace VSCodeEscript
{
class LSPWorkspace;
}
namespace VSCodeEscript::CompilerExt
{

using ReferencesResult = std::vector<Pol::Bscript::Compiler::SourceLocation>;

class ReferencesBuilder : public SemanticContextBuilder<ReferencesResult>
{
public:
  ReferencesBuilder( Pol::Bscript::Compiler::CompilerWorkspace&, VSCodeEscript::LSPWorkspace*,
                     const Pol::Bscript::Compiler::Position& position );

  ~ReferencesBuilder() override = default;

  virtual std::optional<ReferencesResult> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;

  virtual std::optional<ReferencesResult> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;

  virtual std::optional<ReferencesResult> get_constant(
      Pol::Bscript::Compiler::ConstDeclaration* ) override;

  virtual std::optional<ReferencesResult> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* ) override;

private:
  LSPWorkspace* lsp_workspace;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_REFERENCESBUILDER_H
