#include "LSPWorkspace.h"
#include "LSPDocument.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include "plib/pkg.h"
#include "plib/systemstate.h"
#include <filesystem>
#include <napi.h>

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPWorkspace::LSPWorkspace( const Napi::CallbackInfo& info )
    : ObjectWrap( info ),
      SourceFileLoader(),
      em_parse_tree_cache( *this, profile ),
      inc_parse_tree_cache( *this, profile )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsObject() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto config = info[0].As<Napi::Object>();
  auto callback = config.Get( "getContents" );

  if ( !callback.IsFunction() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  GetContents = Napi::Persistent( callback.As<Napi::Function>() );
}

Napi::Function LSPWorkspace::GetClass( Napi::Env env )
{
  return DefineClass( env, "LSPWorkspace",
                      { LSPWorkspace::InstanceMethod( "read", &LSPWorkspace::Read ) } );
}


Napi::Value LSPWorkspace::Read( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto cfg = info[0].As<Napi::String>();
  try
  {
    compilercfg.Read( cfg.As<Napi::String>().Utf8Value() );

    Pol::Plib::systemstate.packages.clear();
    Pol::Plib::systemstate.packages_byname.clear();

    for ( const auto& elem : compilercfg.PackageRoot )
    {
      Pol::Plib::load_packages( elem, true /* quiet */ );
    }
    Pol::Plib::replace_packages();
    Pol::Plib::check_package_deps();
    return env.Undefined();
  }
  catch ( const std::exception& ex )
  {
    Napi::Error::New( env, ex.what() ).ThrowAsJavaScriptException();
  }
  catch ( ... )
  {
    Napi::Error::New( env, "Unknown Error" ).ThrowAsJavaScriptException();
  }

  return Napi::Value();
}

std::string LSPWorkspace::get_contents( const std::string& pathname ) const
{
  auto value = GetContents.Call( Value(), { Napi::String::New( Env(), pathname ) } );
  if ( !value.IsString() )
  {
    throw std::runtime_error( "Could not get contents of file" );
  }
  return value.As<Napi::String>().Utf8Value();
}

std::unique_ptr<Compiler::Compiler> LSPWorkspace::make_compiler()
{
  return std::make_unique<Compiler::Compiler>( *this, em_parse_tree_cache, inc_parse_tree_cache,
                                               profile );
}
}  // namespace VSCodeEscript