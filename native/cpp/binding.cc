#include <napi.h>

#include "napi/ExtensionConfig.h"
#include "napi/LSPDocument.h"
#include "napi/LSPWorkspace.h"

using namespace Pol::Bscript;

Napi::Object Init( Napi::Env env, Napi::Object exports )
{
  exports.Set( Napi::String::New( env, "LSPWorkspace" ),
               VSCodeEscript::LSPWorkspace::GetClass( env ) );

  exports.Set( Napi::String::New( env, "LSPDocument" ),
               VSCodeEscript::LSPDocument::GetClass( env ) );

  auto ExtensionConfiguration = Napi::Object::New( env );
  ExtensionConfiguration["setFromObject"] =
      Napi::Function::New( env, &VSCodeEscript::ExtensionConfiguration::SetFromObject );
  ExtensionConfiguration["get"] =
      Napi::Function::New( env, &VSCodeEscript::ExtensionConfiguration::Get );
  exports.Set( Napi::String::New( env, "ExtensionConfiguration" ), ExtensionConfiguration );

  env.SetInstanceData( new Napi::Reference<Napi::Object>( Napi::Persistent( exports ) ) );
  return exports;
}

NODE_API_MODULE( hello, Init )
