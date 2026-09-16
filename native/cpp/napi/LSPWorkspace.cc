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

#include <cstdio>
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
    Napi::TypeError::New(
        env, Napi::String::New( env, "Invalid arguments: arguments[0] is not an object" ) )
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
        LSPWorkspace::InstanceMethod( "getDocument", &LSPWorkspace::GetDocument ),
        LSPWorkspace::InstanceMethod( "clearParseTreeCache", &LSPWorkspace::ClearParseTreeCache ),
        LSPWorkspace::InstanceAccessor( "profile", &LSPWorkspace::GetProfile, nullptr ),
        LSPWorkspace::InstanceAccessor( "autoCompiledScripts", &LSPWorkspace::AutoCompiledScripts,
                                        nullptr ) } );
}


// Collects script and include files beneath `basedir`.
//
// Every filesystem call below deliberately uses the non-throwing std::error_code
// overload. This walk runs during startup indexing across an entire POL tree,
// where a permission-denied directory, a directory junction, a dangling symlink,
// a file removed mid-walk, or a path exceeding MAX_PATH are all routine. The
// throwing overloads would raise std::filesystem_error out of an N-API method,
// which terminates the language server process. Unreadable entries are reported
// on stderr (piped to the "EScript Language Server" output channel) and skipped.
void recurse_collect( const fs::path& basedir, std::set<std::string>* files_src,
                      std::set<std::string>* files_inc )
{
  std::error_code ec;

  if ( !fs::is_directory( basedir, ec ) || ec )
    return;

  auto dir_itr = fs::recursive_directory_iterator(
      basedir, fs::directory_options::skip_permission_denied, ec );
  if ( ec )
  {
    fprintf( stderr, "[escript-lsp] Skipping unreadable directory '%s': %s\n",
             basedir.string().c_str(), ec.message().c_str() );
    return;
  }

  const auto end = fs::recursive_directory_iterator();
  while ( dir_itr != end )
  {
    const auto& path = dir_itr->path();

    if ( auto fn = path.filename().string(); !fn.empty() && *fn.begin() == '.' )
    {
      if ( dir_itr->is_directory( ec ) && !ec )
        dir_itr.disable_recursion_pending();
      ec.clear();
    }
    else if ( dir_itr->is_regular_file( ec ) && !ec )
    {
      const auto ext = path.extension();
      const bool is_inc = !ext.compare( ".inc" );
      const bool is_src = !ext.compare( ".src" ) || !ext.compare( ".hsr" ) ||
                          ( compilercfg.CompileAspPages && !ext.compare( ".asp" ) );

      if ( is_inc || is_src )
      {
        auto canonical = fs::canonical( path, ec );
        if ( ec )
        {
          fprintf( stderr, "[escript-lsp] Skipping unresolvable file '%s': %s\n",
                   path.string().c_str(), ec.message().c_str() );
          ec.clear();
        }
        else
        {
          ( is_inc ? files_inc : files_src )->insert( canonical.string() );
        }
      }
    }
    else
    {
      ec.clear();
    }

    dir_itr.increment( ec );
    if ( ec )
    {
      // Do not retry: a failing increment may not advance, which would spin.
      fprintf( stderr, "[escript-lsp] Stopping directory walk under '%s': %s\n",
               basedir.string().c_str(), ec.message().c_str() );
      break;
    }
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


Napi::Value LSPWorkspace::AutoCompiledScripts( const Napi::CallbackInfo& info )
{
  if ( !CompiledScripts.IsEmpty() )
  {
    return CompiledScripts.Value();
  }

  auto env = info.Env();

  // This runs during startup indexing over the whole POL tree. An unhandled
  // exception here previously terminated the language server with no output.
  try
  {
    std::set<std::string> files;

    recurse_collect( fs::path( compilercfg.PolScriptRoot ), &files, &files );
    for ( const auto& pkg : Pol::Plib::systemstate.packages )
      recurse_collect( fs::path( pkg->dir() ), &files, &files );

    auto results = Napi::Array::New( env, files.size() );

    uint32_t index = 0;
    for ( const auto& path : files )
    {
      results.Set( index++, Napi::String::New( env, path ) );
    }

    results.Freeze();
    CompiledScripts.Reset( results );
    return results;
  }
  catch ( const Napi::Error& )
  {
    throw;
  }
  catch ( const std::exception& ex )
  {
    Napi::Error::New( env, std::string( "Error collecting workspace scripts: " ) + ex.what() )
        .ThrowAsJavaScriptException();
  }
  catch ( ... )
  {
    Napi::Error::New( env, "Unknown error collecting workspace scripts" )
        .ThrowAsJavaScriptException();
  }
  return Napi::Value();
}

Napi::Value LSPWorkspace::Open( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  _workspaceRoot = std::filesystem::path( info[0].As<Napi::String>().Utf8Value() );
  std::string cfg( ( _workspaceRoot / "scripts" / "ecompile.cfg" ).string() );

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

    configure_parse_tree_caches();
    clear_parse_tree_caches();

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

  std::string cfg( ( _workspaceRoot / "scripts" / "ecompile.cfg" ).string() );

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

    configure_parse_tree_caches();

    if ( has_changes )
    {
      clear_parse_tree_caches();
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
    path = ( _workspaceRoot / filepath ).string();
  }
}

std::string LSPWorkspace::get_contents( const std::string& pathname ) const
{
  auto value = GetContents.Call( Value(), { Napi::String::New( Env(), pathname ) } );

  // A string means the file is open in an editor and this is its buffer, unsaved
  // edits included -- which is the whole reason contents are fetched through JS.
  if ( value.IsString() )
  {
    return value.As<Napi::String>().Utf8Value();
  }

  // Anything else means "not open in an editor". Reading it here instead of
  // having JS answer with readFileSync drops an N-API round trip and two string
  // copies per file -- on the path walked by every include of every analysis and
  // by every file of the workspace index build, almost none of which are open.
  //
  // Delegating to the base implementation rather than opening the file here
  // keeps the LSP reading files exactly the way ecompile does.
  return SourceFileLoader::get_contents( pathname );
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

void LSPWorkspace::configure_parse_tree_caches()
{
  // ecompile.cfg holds these as ints; a negative value would wrap to a huge
  // unsigned limit and make the cache unbounded.
  auto clamp = []( int size ) { return size > 0 ? static_cast<unsigned>( size ) : 0u; };

  em_parse_tree_cache.configure( clamp( compilercfg.EmParseTreeCacheSize ) );
  inc_parse_tree_cache.configure( clamp( compilercfg.IncParseTreeCacheSize ) );
}

void LSPWorkspace::prune_parse_tree_caches()
{
  em_parse_tree_cache.keep_some();
  inc_parse_tree_cache.keep_some();
}

void LSPWorkspace::clear_parse_tree_caches()
{
  em_parse_tree_cache.clear();
  inc_parse_tree_cache.clear();
}

Napi::Value LSPWorkspace::ClearParseTreeCache( const Napi::CallbackInfo& info )
{
  clear_parse_tree_caches();
  return info.Env().Undefined();
}

// Exposes the compiler's existing counters, which were previously collected but
// never readable from JS.
//
// All of Profile's fields are surfaced, not just the parse/cache subset. Now that
// parsing is cached, the interesting costs are the phases that still re-run on
// every analyze -- `optimize`, `analyze`, `tokenize` -- and the AST rebuild that
// happens even on a parse-tree cache hit (`ast*Micros`).
//
// Nothing resets these: they are cumulative for the life of the workspace, so a
// caller has to diff two snapshots rather than read absolutes.
//
// Caveat inherited from the compiler: `astSrcMicros` and `astIncMicros` are
// decremented by nested include time, so they read as self-time and can be
// transiently negative.
Napi::Value LSPWorkspace::GetProfile( const Napi::CallbackInfo& info )
{
  auto env = info.Env();
  auto result = Napi::Object::New( env );

  auto set = [&]( const char* name, auto value )
  { result[name] = Napi::Number::New( env, static_cast<double>( value ) ); };

  set( "buildWorkspaceMicros", profile.build_workspace_micros.load() );
  set( "registerConstDeclarationsMicros", profile.register_const_declarations_micros.load() );
  set( "optimizeMicros", profile.optimize_micros.load() );
  set( "disambiguateMicros", profile.disambiguate_micros.load() );
  set( "analyzeMicros", profile.analyze_micros.load() );
  set( "tokenizeMicros", profile.tokenize_micros.load() );
  set( "codegenMicros", profile.codegen_micros.load() );
  set( "pruneCacheSelectMicros", profile.prune_cache_select_micros.load() );
  set( "pruneCacheDeleteMicros", profile.prune_cache_delete_micros.load() );

  // An ANTLR ambiguity report means the SLL parse bailed and the file was
  // re-parsed in full LL mode -- roughly twice the parse cost for that file.
  set( "ambiguities", profile.ambiguities.load() );

  set( "parseEmCount", profile.parse_em_count.load() );
  set( "parseIncCount", profile.parse_inc_count.load() );
  set( "parseSrcCount", profile.parse_src_count.load() );

  set( "loadEmMicros", profile.load_em_micros.load() );
  set( "parseEmMicros", profile.parse_em_micros.load() );
  set( "astEmMicros", profile.ast_em_micros.load() );

  set( "parseIncMicros", profile.parse_inc_micros.load() );
  set( "astIncMicros", profile.ast_inc_micros.load() );

  set( "parseSrcMicros", profile.parse_src_micros.load() );
  set( "astSrcMicros", profile.ast_src_micros.load() );

  set( "astResolveFunctionsMicros", profile.ast_resolve_functions_micros.load() );

  set( "cacheHits", profile.cache_hits.load() );
  set( "cacheMisses", profile.cache_misses.load() );

  return result;
}

Napi::Value LSPWorkspace::GetWorkspaceRoot( const Napi::CallbackInfo& info )
{
  return Napi::String::New( info.Env(), _workspaceRoot.generic_string() );
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
