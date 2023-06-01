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
struct ProgressData
{
  std::string path;
};

class TestWorker : public Napi::AsyncProgressQueueWorker<ProgressData>
{
public:
  // static Napi::Value CreateWork( const Napi::CallbackInfo& info )
  // {
  //   int32_t times = info[0].As<Napi::Number>().Int32Value();
  //   Napi::Function cb = info[1].As<Napi::Function>();
  //   Napi::Function progress = info[2].As<Napi::Function>();

  //   TestWorker* worker =
  //       new TestWorker( cb, progress, "TestResource", Napi::Object::New( info.Env() ), times );

  //   return Napi::External<TestWorker>::New( info.Env(), worker );
  // }

  // static void QueueWork( const Napi::CallbackInfo& info )
  // {
  //   auto wrap = info[0].As<Napi::External<TestWorker>>();
  //   auto worker = wrap.Data();
  //   worker->Queue();
  // }

public:
  TestWorker( Napi::Function progress, const std::set<std::string>& files )
      : AsyncProgressQueueWorker( progress.Env() ), files_( files ), _deferred( progress.Env() )
  {
    _js_progress_cb.Reset( progress, 1 );
  }

  Napi::Promise Promise() const { return _deferred.Promise(); }


protected:
  void Execute( const ExecutionProgress& progress ) override
  {
    // using namespace std::chrono_literals;
    // std::this_thread::sleep_for( 1s );

    // if ( _times < 0 )
    // {
    //   SetError( "test error" );
    // }
    // else
    // {
    //   progress.Signal();
    // }
    // ProgressData data{ 0 };
    // for ( int32_t idx = 0; idx < _times; idx++ )
    // {
    //   data.progress = idx;
    //   progress.Send( &data, 1 );
    // }

    for ( const auto& path : files_ )
    {
      // std::lock_guard<std::mutex> lock( _mutex_cache );
      // if ( _cache.find( path ) == _cache.end() )
      //   _cache[path] =
      //       Persistent( LSPWorkspace_ctor.New( { Value(), Napi::String::New( env, path ) } ) );
    }
  }

  void OnProgress( const ProgressData* data, size_t count ) override
  {
    Napi::Env env = Env();
    _test_case_count++;
    if ( !_js_progress_cb.IsEmpty() )
    {
      if ( _test_case_count == 1 )
      {
        if ( count != 0 )
        {
          SetError( "expect 0 count of data on 1st call" );
        }
      }
      else
      {
        // Napi::Number progress = Napi::Number::New( env, data->progress );
        // _js_progress_cb.Call( Receiver().Value(), { progress } );
      }
    }
  }

  void OnOK() override {}

private:
  std::set<std::string> files_;

  int32_t _times;
  size_t _test_case_count = 0;
  Napi::FunctionReference _js_progress_cb;
  Napi::Promise::Deferred _deferred;
};


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
      files_inc->insert( dir_itr->path().u8string() );
    else if ( !ext.compare( ".src" ) || !ext.compare( ".hsr" ) ||
              ( compilercfg.CompileAspPages && !ext.compare( ".asp" ) ) )
      files_src->insert( dir_itr->path().u8string() );
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
  auto LSPWorkspace_ctor = env.GetInstanceData<Napi::Reference<Napi::Object>>()
                               ->Value()
                               .Get( "LSPDocument" )
                               .As<Napi::Function>();
  auto document = LSPWorkspace_ctor.New( { Value(), Napi::String::New( env, path ) } );
  _cache[path] = Persistent( document );
  return document;
}

void LSPWorkspace::foreach_cache_entry( std::function<void( LSPDocument* )> callback )
{
  for ( const auto& entry : _cache )
  {
    callback( LSPDocument::Unwrap( entry.second.Value() ) );
  }
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