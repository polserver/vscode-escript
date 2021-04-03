#include "LSPWorkspace.h"
#include "LSPDocument.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include "clib/strutil.h"
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
                      { LSPWorkspace::InstanceMethod( "read", &LSPWorkspace::Read ),
                        LSPWorkspace::InstanceMethod( "open", &LSPWorkspace::Open ),
                        LSPWorkspace::InstanceMethod( "close", &LSPWorkspace::Close ),
                        LSPWorkspace::InstanceMethod( "analyze", &LSPWorkspace::Analyze ),
                        LSPWorkspace::InstanceMethod( "diagnostics", &LSPWorkspace::Diagnostics ),
                        LSPWorkspace::InstanceMethod( "tokens", &LSPWorkspace::Tokens ),
                        LSPWorkspace::InstanceMethod( "dependees", &LSPWorkspace::Dependees ) } );
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

Napi::Value LSPWorkspace::Open( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>().Utf8Value();
  auto extension = std::filesystem::path( pathname ).extension().string();
  Pol::Clib::mklowerASCII( extension );
  bool is_module = extension.compare( ".em" ) == 0;
  _cache.emplace( std::make_pair( pathname, LSPDocument( *this, pathname, is_module ) ) );
  return info.Env().Undefined();
}

Napi::Value LSPWorkspace::Close( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>();
  auto itr = _cache.find( pathname );
  if ( itr != _cache.end() )
  {
    _cache.erase( itr );
    return Napi::Boolean::New( env, true );
  }
  return Napi::Boolean::New( env, false );
}

Napi::Value LSPWorkspace::Analyze( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>();
  auto itr = _cache.find( pathname );
  if ( itr == _cache.end() )
  {
    Napi::Error::New( env, Napi::String::New( env, "Document not opened" ) )
        .ThrowAsJavaScriptException();
  }
  auto& document = itr->second;
  try
  {
    document.analyze();
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

Napi::Value LSPWorkspace::Diagnostics( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>();
  auto itr = _cache.find( pathname );
  if ( itr == _cache.end() )
  {
    Napi::Error::New( env, Napi::String::New( env, "Document not opened" ) )
        .ThrowAsJavaScriptException();
  }
  auto& document = itr->second;
  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  for ( const auto& diagnostic : document.reporter->diagnostics )
  {
    auto diag = Napi::Object::New( env );
    auto range = Napi::Object::New( env );
    auto rangeStart = Napi::Object::New( env );
    range["start"] = rangeStart;
    rangeStart["line"] = diagnostic.location.start.line_number - 1;
    rangeStart["character"] = diagnostic.location.start.character_column - 1;
    auto rangeEnd = Napi::Object::New( env );
    range["end"] = rangeEnd;
    rangeEnd["line"] = diagnostic.location.start.line_number - 1;
    rangeEnd["character"] = diagnostic.location.start.character_column - 1;
    diag["range"] = range;
    diag["severity"] = Napi::Number::New(
        env, diagnostic.severity == Compiler::Diagnostic::Severity::Error ? 1 : 2 );
    diag["message"] = Napi::String::New( env, diagnostic.message );

    push.Call( results, { diag } );
  }

  return results;
}

Napi::Value LSPWorkspace::Tokens( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>();
  auto itr = _cache.find( pathname );
  if ( itr == _cache.end() )
  {
    Napi::Error::New( env, Napi::String::New( env, "Document not opened" ) )
        .ThrowAsJavaScriptException();
  }
  auto& document = itr->second;

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  if ( document.compiler_workspace )
  {
    for ( const auto& token : document.compiler_workspace->tokens )
    {
      auto semTok = Napi::Array::New( env );
      push.Call( semTok, { Napi::Number::New( env, token.line_number - 1 ) } );
      push.Call( semTok, { Napi::Number::New( env, token.character_column - 1 ) } );
      push.Call( semTok, { Napi::Number::New( env, token.length ) } );
      push.Call( semTok, { Napi::Number::New( env, static_cast<unsigned int>( token.type ) ) } );
      push.Call( semTok, { Napi::Number::New( env, 0 ) } );
      push.Call( results, { semTok } );
    }
  }

  return results;
}

Napi::Value LSPWorkspace::Dependees( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto pathname = info[0].As<Napi::String>().Utf8Value();

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  for ( const auto& cacheEntry : _cache )
  {
    const auto& document = cacheEntry.second;
    if ( document.pathname.compare( pathname ) == 0 || !document.compiler_workspace )
    {
      continue;
    }

    for ( const auto& sourceId : document.compiler_workspace->referenced_source_file_identifiers )
    {
      if ( sourceId->pathname.compare( pathname ) == 0 )
      {
        push.Call( results, { Napi::String::New( env, document.pathname ) } );
        break;
      }
    }
  }

  return results;
}

std::string LSPWorkspace::get_contents( const std::string& pathname ) const
{
  auto itr = _cache.find( pathname );
  if ( itr != _cache.end() )
  {
    auto value = GetContents.Call( Value(), { Napi::String::New( Env(), pathname ) } );
    if ( !value.IsString() )
    {
      throw std::runtime_error( "Could not get contents of file" );
    }
    return value.As<Napi::String>().Utf8Value();
  }
  return SourceFileLoader::get_contents( pathname );
}

std::unique_ptr<Compiler::Compiler> LSPWorkspace::make_compiler()
{
  auto compiler = std::make_unique<Compiler::Compiler>( *this, em_parse_tree_cache, inc_parse_tree_cache,
                                               profile );
  compiler->set_include_compile_mode();
  return std::move( compiler );
}
}  // namespace VSCodeEscript