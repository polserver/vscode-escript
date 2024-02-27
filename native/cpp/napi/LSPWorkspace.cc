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

#include <filesystem>
#include <set>
#include <thread>

namespace fs = std::filesystem;
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
        LSPWorkspace::InstanceMethod( "reopen", &LSPWorkspace::Reopen ),
        LSPWorkspace::InstanceMethod( "getConfigValue", &LSPWorkspace::GetConfigValue ),
        LSPWorkspace::InstanceAccessor( "workspaceRoot", &LSPWorkspace::GetWorkspaceRoot, nullptr ),
        LSPWorkspace::InstanceAccessor( "scripts", &LSPWorkspace::AutoCompiledScripts, nullptr ),
        LSPWorkspace::InstanceMethod( "cacheScripts", &LSPWorkspace::CacheCompiledScripts ),
        LSPWorkspace::InstanceMethod( "getDocument", &LSPWorkspace::GetDocument ),
        LSPWorkspace::InstanceAccessor( "autoCompiledScripts", &LSPWorkspace::AutoCompiledScripts,
                                        nullptr ) } );
}


void recurse_collect( const fs::path& basedir, std::set<std::string>* files_src,
                      std::set<std::string>* files_inc )
{
  if ( !fs::is_directory( basedir ) )
    return;
  std::error_code ec;
  for ( auto dir_itr = fs::recursive_directory_iterator( basedir, ec );
        dir_itr != fs::recursive_directory_iterator(); ++dir_itr )
  {
    if ( auto fn = dir_itr->path().filename().u8string(); !fn.empty() && *fn.begin() == '.' )
    {
      if ( dir_itr->is_directory() )
        dir_itr.disable_recursion_pending();
      continue;
    }
    else if ( !dir_itr->is_regular_file() )
      continue;
    const auto ext = dir_itr->path().extension();
    if ( !ext.compare( ".inc" ) )
      files_inc->insert( fs::canonical( dir_itr->path() ).u8string() );
    else if ( !ext.compare( ".src" ) || !ext.compare( ".hsr" ) ||
              ( compilercfg.CompileAspPages && !ext.compare( ".asp" ) ) )
      files_src->insert( fs::canonical( dir_itr->path() ).u8string() );
  }
}


Napi::Value LSPWorkspace::GetDocument( const Napi::CallbackInfo& info )
{
  auto env = info.Env();
  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
    return Napi::Value();
  }

  auto path = info[0].As<Napi::String>().Utf8Value();
  auto existing = _cache.find( path );
  if ( existing != _cache.end() )
  {
    return existing->second.Value();
  }
  auto LSPDocument_ctor = env.GetInstanceData<Napi::Reference<Napi::Object>>()
                              ->Value()
                              .Get( "LSPDocument" )
                              .As<Napi::Function>();
  auto document = LSPDocument_ctor.New( { Value(), Napi::String::New( env, path ) } );
  _cache[path] = Persistent( document );
  return document;
}

LSPDocument* LSPWorkspace::create_or_get_from_cache( const std::string& path )
{
  auto env = Env();
  auto existing = _cache.find( path );
  if ( existing != _cache.end() )
  {
    return LSPDocument::Unwrap( existing->second.Value() );
  }
  auto LSPDocument_ctor = env.GetInstanceData<Napi::Reference<Napi::Object>>()
                              ->Value()
                              .Get( "LSPDocument" )
                              .As<Napi::Function>();
  auto document = LSPDocument_ctor.New( { Value(), Napi::String::New( env, path ) } );
  _cache[path] = Persistent( document );
  return LSPDocument::Unwrap( document );
}

Napi::Value LSPWorkspace::CacheCompiledScripts( const Napi::CallbackInfo& info )
{
  auto env = info.Env();
  if ( info.Length() < 1 || !info[0].IsFunction() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
    return Napi::Value();
  }

  std::set<std::string> files;

  recurse_collect( fs::path( compilercfg.PolScriptRoot ), &files, &files );
  for ( const auto& pkg : Pol::Plib::systemstate.packages )
    recurse_collect( fs::path( pkg->dir() ), &files, &files );

  auto LSPWorkspace_ctor = env.GetInstanceData<Napi::Reference<Napi::Object>>()
                               ->Value()
                               .Get( "LSPDocument" )
                               .As<Napi::Function>();

  for ( const auto& path : files )
  {
    if ( _cache.find( path ) == _cache.end() )
    {
      auto document = LSPWorkspace_ctor.New( { Value(), Napi::String::New( env, path ) } );
      _cache[path] = Persistent( document );
      document.Get( "analyze" ).As<Napi::Function>().Call( document, {} );
    }
  }

  return env.Undefined();
}


Napi::Value LSPWorkspace::AutoCompiledScripts( const Napi::CallbackInfo& info )
{
  if ( !CompiledScripts.IsEmpty() )
  {
    return CompiledScripts.Value();
  }

  std::set<std::string> files;

  recurse_collect( fs::path( compilercfg.PolScriptRoot ), &files, &files );
  for ( const auto& pkg : Pol::Plib::systemstate.packages )
    recurse_collect( fs::path( pkg->dir() ), &files, &files );

  auto env = info.Env();
  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  for ( const auto& path : files )
  {
    push.Call( results, { Napi::String::New( env, path ) } );
  }

  results.Freeze();
  CompiledScripts.Reset( results );
  return results;
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
  std::string cfg( ( _workspaceRoot / "scripts" / "ecompile.cfg" ).u8string() );

  try
  {
    compilercfg.Read( cfg );

    make_absolute( compilercfg.ModuleDirectory );
    make_absolute( compilercfg.PolScriptRoot );
    make_absolute( compilercfg.IncludeDirectory );

    for ( std::string& packageRoot : compilercfg.PackageRoot )
    {
      make_absolute( packageRoot );
    }

    CompiledScripts.Reset();
    _cache.clear();
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

Napi::Value LSPWorkspace::Reopen( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( _workspaceRoot.empty() )
  {
    Napi::Error::New( env, "Workspace was never open()'ed." ).ThrowAsJavaScriptException();
    return Napi::Value();
  }

  std::string cfg( ( _workspaceRoot / "scripts" / "ecompile.cfg" ).u8string() );

  try
  {
    bool has_changes = false;

    auto ModuleDirectory = compilercfg.ModuleDirectory;
    auto PolScriptRoot = compilercfg.PolScriptRoot;
    auto IncludeDirectory = compilercfg.IncludeDirectory;

    std::set<std::string> PackageRoot( compilercfg.PackageRoot.begin(),
                                       compilercfg.PackageRoot.end() );

    compilercfg.Read( cfg );

    make_absolute( compilercfg.ModuleDirectory );
    make_absolute( compilercfg.PolScriptRoot );
    make_absolute( compilercfg.IncludeDirectory );

    if ( ModuleDirectory.compare( compilercfg.ModuleDirectory ) != 0 )
      has_changes = true;
    else if ( PolScriptRoot.compare( compilercfg.PolScriptRoot ) != 0 )
      has_changes = true;
    else if ( IncludeDirectory.compare( compilercfg.IncludeDirectory ) != 0 )
      has_changes = true;

    for ( std::string& packageRoot : compilercfg.PackageRoot )
    {
      make_absolute( packageRoot );

      if ( !has_changes )
      {
        auto existing = PackageRoot.find( packageRoot );

        if ( existing == PackageRoot.end() )
        {
          has_changes = true;
        }
      }
    }

    if ( !has_changes && PackageRoot.size() != compilercfg.PackageRoot.size() )
    {
      has_changes = true;
    }

    if ( has_changes )
    {
      CompiledScripts.Reset();
      _cache.clear();
      Pol::Plib::systemstate.packages.clear();
      Pol::Plib::systemstate.packages_byname.clear();

      for ( const auto& elem : compilercfg.PackageRoot )
      {
        Pol::Plib::load_packages( elem, true /* quiet */ );
      }
      Pol::Plib::replace_packages();
      Pol::Plib::check_package_deps();
    }

    return Napi::Boolean::New( env, has_changes );
  }
  catch ( const std::exception& ex )
  {
    _workspaceRoot = "";
    Napi::Error::New( env, ex.what() ).ThrowAsJavaScriptException();
    return Napi::Value();
  }
  catch ( ... )
  {
    _workspaceRoot = "";
    Napi::Error::New( env, "Unknown Error" ).ThrowAsJavaScriptException();
    return Napi::Value();
  }
}

void LSPWorkspace::make_absolute( std::string& path )
{
  std::filesystem::path filepath( path );
  if ( filepath.is_relative() )
  {
    path = ( _workspaceRoot / filepath ).u8string();
  }
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