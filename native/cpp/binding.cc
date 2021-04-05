#include <napi.h>

#include "LSPWorkspace.h"
#include "LSPDocument.h"

using namespace Pol::Bscript;

Napi::Object Init( Napi::Env env, Napi::Object exports )
{
  exports.Set( Napi::String::New( env, "LSPWorkspace" ),
               VSCodeEscript::LSPWorkspace::GetClass( env ) );

  exports.Set( Napi::String::New( env, "LSPDocument" ),
               VSCodeEscript::LSPDocument::GetClass( env ) );
  return exports;
}

NODE_API_MODULE( hello, Init )
