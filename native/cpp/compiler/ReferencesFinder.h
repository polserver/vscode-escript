#ifndef VSCODEESCRIPT_REFERENCESFINDER_H
#define VSCODEESCRIPT_REFERENCESFINDER_H

#include "SemanticContextBuilder.h"
#include "SourceLocationComparator.h"

#include <set>
namespace VSCodeEscript
{
class LSPWorkspace;
}
namespace VSCodeEscript::CompilerExt
{
using ReferencesResult = std::set<ReferenceLocation, ReferenceLocationComparator>;

class ReferencesFinder : public SemanticContextBuilder<ReferencesResult>
{
public:
  ReferencesFinder( Pol::Bscript::Compiler::CompilerWorkspace&, VSCodeEscript::LSPWorkspace*,
                    const Pol::Bscript::Compiler::Position& position );

  ~ReferencesFinder() override = default;

  virtual std::optional<ReferencesResult> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;

  virtual std::optional<ReferencesResult> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;

  virtual std::optional<ReferencesResult> get_constant(
      Pol::Bscript::Compiler::ConstDeclaration* ) override;

  virtual std::optional<ReferencesResult> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* ) override;

  virtual std::optional<ReferencesResult> get_program_parameter( const std::string& name ) override;

  virtual std::optional<ReferencesResult> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;

private:
  LSPWorkspace* lsp_workspace;

  std::optional<ReferencesResult> get_references_by_definition(
      const Pol::Bscript::Compiler::SourceLocation& loc );
  std::optional<ReferencesResult> get_references_by_definition(
      const std::string& pathname, const Pol::Bscript::Compiler::Range& range );
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_REFERENCESFINDER_H
