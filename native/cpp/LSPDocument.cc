#include "LSPDocument.h"
#include "LSPWorkspace.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "clib/strutil.h"
#include <filesystem>

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( LSPWorkspace& workspace, const std::string& pathname )
    : workspace( workspace ),
      pathname( pathname ),
      reporter( std::make_unique<Compiler::DiagnosticReporter>() ),
      report( std::make_unique<Compiler::Report>( *reporter ) )
{
  auto extension = std::filesystem::path( pathname ).extension().string();
  Pol::Clib::mklowerASCII( extension );
  if ( extension.compare( ".em" ) == 0 )
  {
    _type = LSPDocumentType::EM;
  }
  else if ( extension.compare( ".inc" ) == 0 )
  {
    _type = LSPDocumentType::INC;
  }
  else
  {
    _type = LSPDocumentType::SRC;
  }
}

void LSPDocument::analyze()
{
  report->clear();
  // Explicitly reset the pointer, in case `compiler->analyze()` throws and
  // does not give a new value to populate. We do not want stale compilation
  // data cached, as the tokens <-> line,col will no longer match.
  compiler_workspace.reset();

  auto compiler = workspace.make_compiler();
  if ( _type == LSPDocumentType::INC )
  {
    compiler->set_include_compile_mode();
  }

  compiler_workspace = compiler->analyze( pathname, *report, _type == LSPDocumentType::EM );
}

}  // namespace VSCodeEscript
