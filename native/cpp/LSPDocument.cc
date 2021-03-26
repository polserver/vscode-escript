#include "LSPDocument.h"
#include "LSPWorkspace.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/model/CompilerWorkspace.h"

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( LSPWorkspace& workspace, const std::string& pathname, bool is_module )
    : workspace( workspace ),
      pathname( pathname ),
      is_module( is_module ),
      reporter( std::make_unique<Compiler::DiagnosticReporter>() ),
      report( std::make_unique<Compiler::Report>( *reporter ) )
{
}

void LSPDocument::precompile()
{
  report->clear();
  // Explicitly reset the pointer, in case `compiler->precompile()` throws and
  // does not give a new value to populate. We do not want stale compilation
  // data cached, as the tokens <-> line,col will no longer match.
  compiler_workspace.reset();

  auto compiler = workspace.make_compiler();
  compiler_workspace = compiler->precompile( pathname, *report, is_module );
}

}  // namespace VSCodeEscript
