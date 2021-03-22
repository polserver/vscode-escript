#include "LSPWorkspace.h"
#include "LSPDocument.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
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
  auto cfg = config.Get( "cfg" );

  if ( !callback.IsFunction() || !cfg.IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  GetContents = Napi::Persistent( callback.As<Napi::Function>() );
  // FIXME: refactor this to be done in an instance method, not during
  // instantiation
  // FIXME: throws
  compilercfg.Read( cfg.As<Napi::String>().Utf8Value() );
}

Napi::Function LSPWorkspace::GetClass( Napi::Env env )
{
  return DefineClass( env, "LSPWorkspace",
                      {
                          LSPWorkspace::InstanceMethod( "open", &LSPWorkspace::Open ),
                          LSPWorkspace::InstanceMethod( "close", &LSPWorkspace::Close ),
                          LSPWorkspace::InstanceMethod( "diagnose", &LSPWorkspace::Diagnose ),
                      } );
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
  _cache.emplace( std::make_pair( pathname, LSPDocument( *this, pathname ) ) );
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
  if ( itr == _cache.end() )
  {
    _cache.erase( itr );
    return Napi::Boolean::New( env, true );
  }
  return Napi::Boolean::New( env, false );
}

Napi::Value LSPWorkspace::Diagnose( const Napi::CallbackInfo& info )
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
    const auto& diagnostics = document.diagnose();

    auto results = Napi::Array::New( env );

    auto push = results.Get( "push" ).As<Napi::Function>();

    for ( const auto& diagnostic : diagnostics )
    {
      auto diag = Napi::Object::New( env );
      auto range = Napi::Object::New( env );
      auto rangeStart = Napi::Object::New( env );
      range["start"] = rangeStart;
      rangeStart["line"] = diagnostic.location.start.line_number;
      rangeStart["character"] = diagnostic.location.start.character_column;
      auto rangeEnd = Napi::Object::New( env );
      range["end"] = rangeEnd;
      rangeEnd["line"] = diagnostic.location.start.line_number;
      rangeEnd["character"] = diagnostic.location.start.character_column;
      diag["range"] = range;
      diag["severity"] = Napi::Number::New(
          env, diagnostic.severity == Compiler::Diagnostic::Severity::Error ? 1 : 2 );
      diag["message"] = Napi::String::New( env, diagnostic.message );

      push.Call( results, { diag } );
    }

    return results;
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
  return std::make_unique<Compiler::Compiler>( *this, em_parse_tree_cache, inc_parse_tree_cache,
                                               profile );
}
}  // namespace VSCodeEscript