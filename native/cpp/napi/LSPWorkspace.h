#pragma once


#include <filesystem>
#include <map>
#include <napi.h>
#include <optional>
#include <vector>

#include "bscript/compiler/Profile.h"
#include "bscript/compiler/file/SourceFileCache.h"
#include "bscript/compiler/file/SourceFileLoader.h"

namespace Pol::Bscript::Compiler
{
class Compiler;
}

namespace VSCodeEscript
{
class LSPDocument;
class LSPWorkspace : public Napi::ObjectWrap<LSPWorkspace>,
                     public Pol::Bscript::Compiler::SourceFileLoader
{
public:
  LSPWorkspace( const Napi::CallbackInfo& info );
  static Napi::Function GetClass( Napi::Env );

  Napi::Value Open( const Napi::CallbackInfo& );
  Napi::Value GetConfigValue( const Napi::CallbackInfo& );
  Napi::Value GetWorkspaceRoot( const Napi::CallbackInfo& );

  std::string get_contents( const std::string& pathname ) const override;

  std::optional<std::string> get_xml_doc_path( const std::string& moduleEmFile ) const;

  std::unique_ptr<Pol::Bscript::Compiler::Compiler> make_compiler();

private:
  std::filesystem::path _workspaceRoot;
  std::map<std::string, LSPDocument> _cache;
  Pol::Bscript::Compiler::Profile profile;
  Pol::Bscript::Compiler::SourceFileCache em_parse_tree_cache;
  Pol::Bscript::Compiler::SourceFileCache inc_parse_tree_cache;
  Napi::FunctionReference GetContents;
  Napi::FunctionReference GetXMLDocPath;
};
}  // namespace VSCodeEscript