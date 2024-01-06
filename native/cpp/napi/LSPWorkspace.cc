#include "LSPWorkspace.h"
#include "LSPDocument.h"

#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include "napi.h"
#include "plib/pkg.h"
#include "plib/systemstate.h"


using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPWorkspace::LSPWorkspace( const Napi::CallbackInfo& info )
    : ObjectWrap( info ),
      SourceFileLoader(),
      _workspaceRoot( "" ),
      em_parse_tree_cache( *this, profile ),
      inc_parse_tree_cache( *this, profile )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsObject() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments: arguments[0] is not an object" ) )
        .ThrowAsJavaScriptException();
  }

  auto config = info[0].As<Napi::Object>();
  auto getContents_cb = config.Get( "getContents" );
  auto getXmlDocPath_cb = config.Get( "getXmlDocPath" );

  if ( !getContents_cb.IsFunction() )
  {
    Napi::TypeError::New(
        env, Napi::String::New( env, "Invalid arguments: getContents is not a function" ) )
        .ThrowAsJavaScriptException();
  }
  else
  {
    GetContents = Napi::Persistent( getContents_cb.As<Napi::Function>() );

    if ( getXmlDocPath_cb.IsFunction() )
      GetXMLDocPath = Napi::Persistent( getXmlDocPath_cb.As<Napi::Function>() );
  }
}

Napi::Function LSPWorkspace::GetClass( Napi::Env env )
{
  return DefineClass(
      env, "LSPWorkspace",
      { LSPWorkspace::InstanceMethod( "open", &LSPWorkspace::Open ),
        LSPWorkspace::InstanceMethod( "getConfigValue", &LSPWorkspace::GetConfigValue ),
        LSPWorkspace::InstanceAccessor( "workspaceRoot", &LSPWorkspace::GetWorkspaceRoot,
                                        nullptr ) } );
}

Napi::Value LSPWorkspace::Open( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  _workspaceRoot = std::filesystem::u8path( info[0].As<Napi::String>().Utf8Value() );
  std::string cfg( _workspaceRoot / "scripts" / "ecompile.cfg" );

  try
  {
    compilercfg.Read( cfg );

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
    _workspaceRoot = "";
    Napi::Error::New( env, ex.what() ).ThrowAsJavaScriptException();
  }
  catch ( ... )
  {
    _workspaceRoot = "";
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

std::optional<std::string> LSPWorkspace::get_xml_doc_path( const std::string& moduleEmFile ) const
{
  if ( GetXMLDocPath.IsEmpty() )
    return std::nullopt;

  auto value = GetXMLDocPath.Call( Value(), { Napi::String::New( Env(), moduleEmFile ) } );

  if ( !value.IsString() )
  {
    return std::nullopt;
  }

  return value.As<Napi::String>().Utf8Value();
}


std::unique_ptr<Compiler::Compiler> LSPWorkspace::make_compiler()
{
  return std::make_unique<Compiler::Compiler>( *this, em_parse_tree_cache, inc_parse_tree_cache,
                                               profile );
}

Napi::Value LSPWorkspace::GetWorkspaceRoot( const Napi::CallbackInfo& info )
{
  return Napi::String::New( info.Env(), _workspaceRoot.generic_u8string() );
}

Napi::Value LSPWorkspace::GetConfigValue( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto key = info[0].As<Napi::String>().Utf8Value();
  if ( key == "PackageRoot" )
  {
    auto values = Napi::Array::New( env );
    auto push = values.Get( "push" ).As<Napi::Function>();
    for ( auto const& packageRoot : compilercfg.PackageRoot )
    {
      push.Call( values, { Napi::String::New( env, packageRoot ) } );
    }
    return values;
  }
  if ( key == "IncludeDirectory" )
    return Napi::String::New( env, compilercfg.IncludeDirectory );

  if ( key == "ModuleDirectory" )
    return Napi::String::New( env, compilercfg.ModuleDirectory );

  if ( key == "PolScriptRoot" )
    return Napi::String::New( env, compilercfg.PolScriptRoot );

  Napi::Error::New( env, "Unknown key: " + key ).ThrowAsJavaScriptException();

  return Napi::Value();
}
}  // namespace VSCodeEscript