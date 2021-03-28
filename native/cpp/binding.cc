#include <napi.h>

#include "LSPWorkspace.h"

#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Profile.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/astbuilder/BuilderWorkspace.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceFileCache.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/file/SourceFileLoader.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include "clib/fileutil.h"
#include <memory>

using namespace Pol::Bscript;

Napi::Object Init( Napi::Env env, Napi::Object exports )
{
  exports.Set( Napi::String::New( env, "LSPWorkspace" ),
               VSCodeEscript::LSPWorkspace::GetClass( env ) );
  return exports;
}

NODE_API_MODULE( hello, Init )
