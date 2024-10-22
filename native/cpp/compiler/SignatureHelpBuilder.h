#ifndef VSCODEESCRIPT_SIGNATUREHELPBUILDER_H
#define VSCODEESCRIPT_SIGNATUREHELPBUILDER_H

#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include <optional>
#include <string>
#include <tuple>
#include <vector>

namespace VSCodeEscript
{
class LSPWorkspace;
}
namespace VSCodeEscript::CompilerExt
{
struct SignatureHelpParameter
{
  size_t start;
  size_t end;
  std::string documentation;
};
struct SignatureHelp
{
  const std::string label;
  const std::vector<SignatureHelpParameter> parameters;
  const size_t active_parameter;
};

class SignatureHelpBuilder
{
public:
  SignatureHelpBuilder( LSPWorkspace* lsp_workspace, Pol::Bscript::Compiler::CompilerWorkspace&,
                        const Pol::Bscript::Compiler::Position& position );

  std::optional<SignatureHelp> context();

protected:
  Pol::Bscript::Compiler::CompilerWorkspace& workspace;
  Pol::Bscript::Compiler::Position position;
  LSPWorkspace* _lsp_workspace;
  std::string calling_scope = "";
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_SIGNATUREHELPBUILDER_H
