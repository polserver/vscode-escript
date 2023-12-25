#include "LSPDocument.h"
#include "../compiler/CompletionBuilder.h"
#include "../compiler/DefinitionBuilder.h"
#include "../compiler/HoverBuilder.h"
#include "../compiler/SignatureHelpBuilder.h"
#include "LSPWorkspace.h"
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
                        LSPDocument::InstanceMethod( "completion", &LSPDocument::Completion ),
                        LSPDocument::InstanceMethod( "definition", &LSPDocument::Definition ),
                        LSPDocument::InstanceMethod( "signatureHelp", &LSPDocument::SignatureHelp ),
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
    const auto& start = diagnostic.location.range.start;
    auto diag = Napi::Object::New( env );
    auto range = Napi::Object::New( env );
    auto rangeStart = Napi::Object::New( env );
    range["start"] = rangeStart;
    rangeStart["line"] = start.line_number - 1;
    rangeStart["character"] = start.character_column - 1;
    auto rangeEnd = Napi::Object::New( env );
    range["end"] = rangeEnd;
    rangeEnd["line"] = start.line_number - 1;
    rangeEnd["character"] = start.character_column - 1;
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

    CompilerExt::HoverBuilder finder( *compiler_workspace, pos );
    auto result = finder.context();
    if ( result.has_value() )
    {
      return Napi::String::New( env, result.value().hover );
    }
  }
  return env.Undefined();
}

Napi::Value LSPDocument::Definition( const Napi::CallbackInfo& info )
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

    CompilerExt::DefinitionBuilder finder( *compiler_workspace, pos );
    auto definition = finder.context();
    if ( definition.has_value() )
    {
      const auto& location = definition.value();
      const auto& locationRange = location.range;
      auto result = Napi::Object::New( env );
      auto range = Napi::Object::New( env );
      auto rangeStart = Napi::Object::New( env );

      range["start"] = rangeStart;
      rangeStart["line"] = locationRange.start.line_number - 1;
      rangeStart["character"] = locationRange.start.character_column - 1;
      auto rangeEnd = Napi::Object::New( env );
      range["end"] = rangeEnd;
      rangeEnd["line"] = locationRange.end.line_number - 1;
      rangeEnd["character"] = locationRange.end.character_column - 1;

      result["range"] = range;
      result["fsPath"] = location.source_file_identifier->pathname;
      return result;
    }
  }
  return env.Undefined();
}

Napi::Value LSPDocument::Completion( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( info.Length() < 1 || !info[0].IsObject() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
  }

  auto results = Napi::Array::New( env );
  auto push = results.Get( "push" ).As<Napi::Function>();

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

    CompilerExt::CompletionBuilder finder( *compiler_workspace, pos );
    auto definition = finder.context();
    for ( const auto& completionItem : definition )
    {
      auto result = Napi::Object::New( env );
      result["label"] = completionItem.label;
      if ( completionItem.kind.has_value() )
      {
        result["kind"] =
            Napi::Number::New( env, static_cast<int32_t>( completionItem.kind.value() ) );
      }
      push.Call( results, { result } );
    }
  }
  return results;
}

Napi::Value LSPDocument::SignatureHelp( const Napi::CallbackInfo& info )
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
        static_cast<unsigned short>( character.As<Napi::Number>().Int32Value() - 1 ) };

    CompilerExt::SignatureHelpBuilder finder( *compiler_workspace, pos );
    auto signatureHelp = finder.context();
    if ( signatureHelp.has_value() )
    {
      auto results = Napi::Object::New( env );
      auto signature = Napi::Object::New( env );
      auto signatureParameters = Napi::Array::New( env );
      auto signatures = Napi::Array::New( env );
      auto push = signatures.Get( "push" ).As<Napi::Function>();

      signature["label"] = signatureHelp->label;
      signature["parameters"] = signatureParameters;
      results["signatures"] = signatures;
      results["activeSignature"] = Napi::Number::New( env, 0 );
      results["activeParameter"] = Napi::Number::New( env, signatureHelp->active_parameter );

      push.Call( signatures, { signature } );

      const auto& parameters = signatureHelp->parameters;

      std::for_each(
          parameters.begin(), parameters.end(),
          [&]( const auto& parameter )
          {
            auto signatureParameter = Napi::Object::New( env );
            auto signatureLabel = Napi::Array::New( env );

            signatureParameter["label"] = signatureLabel;

            push.Call( signatureLabel, { Napi::Number::New( env, std::get<0>( parameter ) ) } );
            push.Call( signatureLabel, { Napi::Number::New( env, std::get<1>( parameter ) ) } );
            push.Call( signatureParameters, { signatureParameter } );
          } );
      return results;
    }
  }
  return env.Undefined();
}

}  // namespace VSCodeEscript
