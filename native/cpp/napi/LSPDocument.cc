#include "LSPDocument.h"
#include "LSPWorkspace.h"
#include "../compiler/SemanticContextFinder.h"
#include "../compiler/HoverBuilder.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "clib/strutil.h"
#include <filesystem>

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( const Napi::CallbackInfo& info )
    : ObjectWrap( info ),
      reporter( std::make_unique<Compiler::DiagnosticReporter>() ),
      report( std::make_unique<Compiler::Report>( *reporter ) )
{
  auto env = info.Env();

  if ( info.Length() < 2 || !info[0].IsObject() || !info[1].IsString() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  workspace = Napi::Persistent( info[0].As<Napi::Object>() );

  pathname = info[1].As<Napi::String>().Utf8Value();

  auto extension = std::filesystem::path( pathname ).extension().string();
  Pol::Clib::mklowerASCII( extension );
  if ( extension.compare( ".em" ) == 0 )
  {
    type = LSPDocumentType::EM;
  }
  else if ( extension.compare( ".inc" ) == 0 )
  {
    type = LSPDocumentType::INC;
  }
  else
  {
    type = LSPDocumentType::SRC;
  }
}


Napi::Function LSPDocument::GetClass( Napi::Env env )
{
  return DefineClass( env, "LSPDocument",
                      { LSPDocument::InstanceMethod( "analyze", &LSPDocument::Analyze ),
                        LSPDocument::InstanceMethod( "diagnostics", &LSPDocument::Diagnostics ),
                        LSPDocument::InstanceMethod( "tokens", &LSPDocument::Tokens ),
                        LSPDocument::InstanceMethod( "hover", &LSPDocument::Hover ),
                        LSPDocument::InstanceMethod( "dependents", &LSPDocument::Dependents ) } );
}


Napi::Value LSPDocument::Analyze( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  try
  {
    report->clear();
    // Explicitly reset the pointer, in case `compiler->analyze()` throws and
    // does not give a new value to populate. We do not want stale compilation
    // data cached, as the tokens <-> line,col will no longer match.
    compiler_workspace.reset();

    auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
    auto compiler = lsp_workspace->make_compiler();
    if ( type == LSPDocumentType::INC )
    {
      compiler->set_include_compile_mode();
    }

    compiler_workspace = compiler->analyze( pathname, *report, type == LSPDocumentType::EM );
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

Napi::Value LSPDocument::Diagnostics( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  for ( const auto& diagnostic : reporter->diagnostics )
  {
    // Skip errors from other files...? Include compilation shows errors from
    // all over. Watch how this this behaves... This may need to _not_ be
    // skipped, and filtered out based off extension setting.
    if ( diagnostic.location.source_file_identifier->pathname.compare( pathname ) )
    {
      continue;
    }
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

Napi::Value LSPDocument::Tokens( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  if ( compiler_workspace )
  {
    for ( const auto& token : compiler_workspace->tokens )
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

Napi::Value LSPDocument::Dependents( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

  if ( compiler_workspace )
  {
    for ( const auto& sourceId : compiler_workspace->referenced_source_file_identifiers )
    {
      push.Call( results, { Napi::String::New( env, sourceId->pathname ) } );
    }
  }

  return results;
}


Napi::Value LSPDocument::Hover( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsObject() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  if ( compiler_workspace )
  {
    auto position = info[0].As<Napi::Object>();
    auto line = position.Get( "line" );
    auto character = position.Get( "character" );
    if ( !line.IsNumber() || !character.IsNumber() )
    {
      Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
          .ThrowAsJavaScriptException();
    }
    Compiler::Position pos{
        static_cast<unsigned short>( line.As<Napi::Number>().Int32Value() ),
        static_cast<unsigned short>( character.As<Napi::Number>().Int32Value() ) };

    // CompilerExt::SemanticContextFinder finder( *compiler_workspace, pos );
    CompilerExt::HoverBuilder finder( *compiler_workspace, pos );
    auto hover = finder.hover();
    if ( hover.has_value() )
    {
      return Napi::String::New( env, hover.value() );
    }
  }
  return env.Undefined();
}

}  // namespace VSCodeEscript
