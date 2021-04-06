#pragma once

#include <map>
#include <napi.h>
#include <vector>

namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
class DiagnosticReporter;
class Report;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript
{
class LSPWorkspace;

enum class LSPDocumentType {
  SRC,
  INC,
  EM
};

class LSPDocument
{
public:
  LSPDocument( LSPWorkspace& workspace, const std::string& pathname );

  void analyze();
  LSPWorkspace& workspace;
  const std::string pathname;
  std::unique_ptr<Pol::Bscript::Compiler::DiagnosticReporter> reporter;
  std::unique_ptr<Pol::Bscript::Compiler::Report> report;
  std::unique_ptr<Pol::Bscript::Compiler::CompilerWorkspace> compiler_workspace;

private:
  LSPDocumentType _type;
};
}  // namespace VSCodeEscript
