#pragma once

#include "bscript/compiler/Report.h"
#include <map>
#include <napi.h>
#include <vector>

namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript
{
class LSPWorkspace;

class LSPDocument
{
public:
  LSPDocument( LSPWorkspace& workspace, const std::string& pathname );

  std::vector<Pol::Bscript::Compiler::Diagnostic>& diagnose();

private:
  LSPWorkspace& workspace;
  std::string pathname;
  std::unique_ptr<Pol::Bscript::Compiler::DiagnosticReporter> reporter;
  std::unique_ptr<Pol::Bscript::Compiler::CompilerWorkspace> compiler_workspace;
};
}  // namespace VSCodeEscript
