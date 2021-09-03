#ifndef VSCODEESCRIPT_SIGNATUREHELPBUILDER_H
#define VSCODEESCRIPT_SIGNATUREHELPBUILDER_H

#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include <optional>
#include <string>
#include <tuple>
#include <vector>

namespace VSCodeEscript::CompilerExt
{
struct SignatureHelp
{
  const std::string label;
  const std::vector<std::tuple<size_t, size_t>> parameters;
  const size_t active_parameter;
};

class SignatureHelpBuilder
{
public:
  SignatureHelpBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                        const Pol::Bscript::Compiler::Position& position );

  std::optional<SignatureHelp> context();

protected:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_SIGNATUREHELPBUILDER_H
