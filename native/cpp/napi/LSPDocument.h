#pragma once

#include <map>
#include <napi.h>
#include <vector>

namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
class DiagnosticReporter;
class Report;
class NodeVisitor;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript
{
class LSPWorkspace;

enum class LSPDocumentType {
  SRC,
  INC,
  EM
};

class LSPDocument : public Napi::ObjectWrap<LSPDocument>
{
public:
  LSPDocument( const Napi::CallbackInfo& info );
  static Napi::Function GetClass( Napi::Env );

  Napi::Value Analyze( const Napi::CallbackInfo& );
  Napi::Value Diagnostics( const Napi::CallbackInfo& );
  Napi::Value Tokens( const Napi::CallbackInfo& );
  Napi::Value Dependents( const Napi::CallbackInfo& );
  Napi::Value Hover( const Napi::CallbackInfo& );
  Napi::Value Definition( const Napi::CallbackInfo& );
  Napi::Value Completion( const Napi::CallbackInfo& );
  Napi::Value SignatureHelp( const Napi::CallbackInfo& );
  Napi::Value References( const Napi::CallbackInfo& );
  Napi::Value ToStringTree( const Napi::CallbackInfo& );

  std::unique_ptr<Pol::Bscript::Compiler::DiagnosticReporter> reporter;

  void accept_visitor(Pol::Bscript::Compiler::NodeVisitor& visitor);

  const std::string& pathname();

private:
  std::unique_ptr<Pol::Bscript::Compiler::Report> report;
  std::unique_ptr<Pol::Bscript::Compiler::CompilerWorkspace> compiler_workspace;
  std::string pathname_;
  Napi::ObjectReference workspace;
  LSPDocumentType type;
};
}  // namespace VSCodeEscript
