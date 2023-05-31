#ifndef VSCODEESCRIPT_REFERENCESBUILDER_H
#define VSCODEESCRIPT_REFERENCESBUILDER_H

#include "SemanticContextBuilder.h"

namespace VSCodeEscript::CompilerExt
{

using ReferencesResult = std::vector<Pol::Bscript::Compiler::SourceLocation>;

class ReferencesBuilder : public SemanticContextBuilder<ReferencesResult>
{
public:
  ReferencesBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                     const Pol::Bscript::Compiler::Position& position );

  ~ReferencesBuilder() override = default;

  virtual std::optional<ReferencesResult> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;

  virtual std::optional<ReferencesResult> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_REFERENCESBUILDER_H
