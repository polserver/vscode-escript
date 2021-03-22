#include "LSPDocument.h"
#include "LSPWorkspace.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/model/CompilerWorkspace.h"

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( LSPWorkspace& workspace, const std::string& pathname )
    : workspace( workspace ), pathname( pathname )
{
}

std::vector<Pol::Bscript::Compiler::Diagnostic>& LSPDocument::diagnose()
{
  reporter = std::make_unique<Compiler::DiagnosticReporter>();
  Compiler::Report report( *reporter );

  auto compiler = workspace.make_compiler();
  compiler_workspace = compiler->precompile( pathname, report );

  return reporter->diagnostics;
}

}  // namespace VSCodeEscript
