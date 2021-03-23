#include "LSPDocument.h"
#include "LSPWorkspace.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/model/CompilerWorkspace.h"

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( LSPWorkspace& workspace, const std::string& pathname )
    : workspace( workspace ),
      pathname( pathname ),
      reporter( std::make_unique<Compiler::DiagnosticReporter>() ),
      report( std::make_unique<Compiler::Report>( *reporter ) )
{
}

void LSPDocument::precompile()
{
  report->clear();
  auto* ws_ptr = compiler_workspace.release();
  compiler_workspace.get_deleter()( ws_ptr );

  auto compiler = workspace.make_compiler();
  compiler_workspace = compiler->precompile( pathname, *report );
}


std::vector<Pol::Bscript::Compiler::Diagnostic>& LSPDocument::diagnose()
{
  precompile();
  return reporter->diagnostics;
}

}  // namespace VSCodeEscript
