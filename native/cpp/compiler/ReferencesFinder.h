#ifndef VSCODEESCRIPT_REFERENCESFINDER_H
#define VSCODEESCRIPT_REFERENCESFINDER_H

#include "SemanticContextBuilder.h"

#include <set>
namespace VSCodeEscript
{
class LSPWorkspace;
}
namespace VSCodeEscript::CompilerExt
{
class SourceLocationComparator
{
public:
  bool operator()( const Pol::Bscript::Compiler::SourceLocation& x1,
                   const Pol::Bscript::Compiler::SourceLocation& x2 ) const;
};

using ReferencesResult = std::set<Pol::Bscript::Compiler::SourceLocation, SourceLocationComparator>;

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

  virtual std::optional<ReferencesResult> get_program_parameter(const std::string& name ) override;

  virtual std::optional<ReferencesResult> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;

private:
  LSPWorkspace* lsp_workspace;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_REFERENCESFINDER_H
