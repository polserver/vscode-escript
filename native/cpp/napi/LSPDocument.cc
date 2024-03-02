#include "LSPDocument.h"
#include "../compiler/CompletionBuilder.h"
#include "../compiler/DefinitionBuilder.h"
#include "../compiler/HoverBuilder.h"
#include "../compiler/ReferencesFinder.h"
#include "../compiler/ReferencesBuilder.h"
#include "../compiler/SignatureHelpBuilder.h"
#include "ExtensionConfig.h"
#include "LSPWorkspace.h"
#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/ast/TopLevelStatements.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/file/SourceLocation.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include "clib/strutil.h"
#include <filesystem>

using namespace Pol::Bscript;

namespace VSCodeEscript
{
LSPDocument::LSPDocument( const Napi::CallbackInfo& info )
    : ObjectWrap( info ),
      referenced_by(),
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

  pathname_ = info[1].As<Napi::String>().Utf8Value();

  auto extension = std::filesystem::path( pathname_ ).extension().string();
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

const std::string& LSPDocument::pathname()
{
  return pathname_;
}

void LSPDocument::add_reference_by( const Compiler::SourceLocation& defined_at,
                                    const Compiler::SourceLocation& used_at )
{
  add_reference_by( defined_at.range, used_at.source_file_identifier->pathname, used_at.range );
}

void LSPDocument::add_reference_by( const Compiler::Range& defined_at,
                                    const std::string& used_at_pathname,
                                    const Compiler::Range& used_at_range )
{
  auto itr = referenced_by.find( defined_at );
  if ( itr != referenced_by.end() )
  {
    itr->second.emplace( CompilerExt::ReferenceLocation{ used_at_pathname, used_at_range } );
  }
  else
  {
    referenced_by.emplace(
        defined_at,
        std::set<CompilerExt::ReferenceLocation, CompilerExt::ReferenceLocationComparator>{
            CompilerExt::ReferenceLocation{ used_at_pathname, used_at_range } } );
  }
}

void LSPDocument::build_references( Pol::Bscript::Compiler::CompilerWorkspace& compiler_workspace )
{
  auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
  CompilerExt::ReferencesBuilder builder( lsp_workspace, compiler_workspace, pathname_ );

  compiler_workspace.top_level_statements->accept( builder );

  if ( auto& program = compiler_workspace.program )
  {
    program->accept( builder );
  }

  for ( auto& user_function : compiler_workspace.user_functions )
  {
    user_function->accept( builder );
  }
}

void LSPDocument::add_reference_by( const Compiler::Range& defined_at,
                                    const Compiler::SourceLocation& used_at )
{
  add_reference_by( defined_at, used_at.source_file_identifier->pathname, used_at.range );
}

Napi::Value LSPDocument::throwError( const std::string& what = "Invalid arguments" )
{
  auto env = Value().Env();
  Napi::TypeError::New( env, Napi::String::New( env, what ) ).ThrowAsJavaScriptException();
  return Napi::Value();
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
                        LSPDocument::InstanceMethod( "references", &LSPDocument::References ),
                        LSPDocument::InstanceMethod( "toStringTree", &LSPDocument::ToStringTree ),
                        LSPDocument::InstanceMethod( "buildReferences", &LSPDocument::BuildReferences ),
                        LSPDocument::InstanceMethod( "toFormattedString", &LSPDocument::ToFormattedString ),
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

    bool continue_on_error =
        info.Length() > 0 && info[0].IsBoolean() ? info[0].As<Napi::Boolean>().Value() : true;

    compiler_workspace =
        compiler->analyze( pathname_, *report, type == LSPDocumentType::EM, continue_on_error );

    if ( compiler_workspace )
    {
      build_references( *compiler_workspace );
    }

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
    if ( diagnostic.location.source_file_identifier->pathname.compare( pathname_ ) )
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

      int modifiers = 0;
      for ( auto const& modifier : token.modifiers )
      {
        modifiers += ( 1 << static_cast<unsigned int>( modifier ) );
      }
      push.Call( semTok, { Napi::Number::New( env, modifiers ) } );

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

    auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
    CompilerExt::HoverBuilder finder( lsp_workspace, *compiler_workspace, pos );
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

Napi::Value LSPDocument::ToStringTree( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( compiler_workspace )
  {
    std::stringstream ss;

    for ( auto& constant : compiler_workspace->const_declarations )
    {
      ss << constant->to_string_tree() << "\n";
    }

    for ( auto& module_function : compiler_workspace->module_function_declarations )
    {
      ss << module_function->to_string_tree() << "\n";
    }

    if ( compiler_workspace->top_level_statements->children.size() )
    {
      ss << compiler_workspace->top_level_statements->to_string_tree() << "\n";
    }

    if ( auto& program = compiler_workspace->program )
    {
      ss << program->to_string_tree() << "\n";
    }

    for ( auto& user_function : compiler_workspace->user_functions )
    {
      ss << user_function->to_string_tree() << "\n";
    }

    return Napi::String::New( env, ss.str() );
  }

  return env.Undefined();
}

Napi::Value LSPDocument::References( const Napi::CallbackInfo& info )
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

    CompilerExt::ReferencesFinder finder( *compiler_workspace,
                                           LSPWorkspace::Unwrap( workspace.Value() ), pos );
    auto references = finder.context();
    if ( references.has_value() )
    {
      auto results = Napi::Array::New( env );
      auto push = results.Get( "push" ).As<Napi::Function>();

      for ( const auto& location : references.value() )
      {
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
        result["fsPath"] = location.pathname;
        push.Call( results, { result } );
      }

      return results;
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

    auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
    CompilerExt::SignatureHelpBuilder finder( lsp_workspace, *compiler_workspace, pos );
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

      std::for_each( parameters.begin(), parameters.end(),
                     [&]( const auto& parameter )
                     {
                       auto signatureParameter = Napi::Object::New( env );
                       auto signatureLabel = Napi::Array::New( env );

                       signatureParameter["label"] = signatureLabel;

                       if ( !parameter.documentation.empty() )
                       {
                         auto signatureDoc = Napi::Object::New( env );

                         signatureDoc["kind"] = "markdown";
                         signatureDoc["value"] = parameter.documentation;
                         signatureParameter["documentation"] = signatureDoc;
                       }

                       push.Call( signatureLabel,
                                  { Napi::Number::New( env, ( parameter.start ) ) } );
                       push.Call( signatureLabel, { Napi::Number::New( env, ( parameter.end ) ) } );
                       push.Call( signatureParameters, { signatureParameter } );
                     } );
      return results;
    }
  }
  return env.Undefined();
}

void LSPDocument::accept_visitor( Pol::Bscript::Compiler::NodeVisitor& visitor )
{
  if ( compiler_workspace )
  {
    compiler_workspace->accept( visitor );
  }
}

Napi::Value LSPDocument::BuildReferences( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  if ( compiler_workspace )
  {
    build_references( *compiler_workspace );
  }
  else
  {
    auto local_reporter = std::make_unique<Compiler::DiagnosticReporter>();
    auto local_report = std::make_unique<Compiler::Report>( *reporter );

    auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
    auto compiler = lsp_workspace->make_compiler();
    if ( type == LSPDocumentType::INC )
    {
      compiler->set_include_compile_mode();
    }

    bool continue_on_error =
        info.Length() > 0 && info[0].IsBoolean() ? info[0].As<Napi::Boolean>().Value() : true;

    if ( auto local_compiler_workspace = compiler->analyze(
             pathname_, *local_report, type == LSPDocumentType::EM, continue_on_error ) )
    {
      build_references( *local_compiler_workspace );
    }
  }

  return env.Undefined();
}

Napi::Value LSPDocument::ToFormattedString( const Napi::CallbackInfo& info )
{
  auto env = info.Env();

  std::optional<Compiler::Range> format_range;

  unsigned short tabSize = compilercfg.FormatterTabWidth;
  bool insertSpaces = !compilercfg.FormatterUseTabs;

    if ( info.Length() > 0 && !info[0].IsUndefined() )
  {
    if ( !info[0].IsObject() )
    {
      return throwError();
    }

    auto optionsObj = info[0].As<Napi::Object>();

    if ( optionsObj.Has( "tabSize" ) )
    {
      auto tabSizeValue = optionsObj.Get( "tabSize" );
      if ( !tabSizeValue.IsNumber() )
      {
        return throwError();
      }
      tabSize = static_cast<unsigned short>( tabSizeValue.As<Napi::Number>().Int32Value() );
    }

    if ( optionsObj.Has( "insertSpaces" ) )
    {
      auto insertSpacesValue = optionsObj.Get( "insertSpaces" );
      if ( !insertSpacesValue.IsBoolean() )
      {
        return throwError();
      }
      insertSpaces = insertSpacesValue.As<Napi::Boolean>().Value();
    }
  }

  if ( info.Length() > 1 && !info[1].IsUndefined() )
  {
    if ( !info[1].IsObject() )
    {
      return throwError();
    }

    auto rangeObj = info[1].As<Napi::Object>();
    if ( !rangeObj.Has( "start" ) || !rangeObj.Has( "end" ) )
    {
      return throwError();
    }

    auto startValue = rangeObj.Get( "start" );
    auto endValue = rangeObj.Get( "end" );
    if ( !startValue.IsObject() || !endValue.IsObject() )
    {
      return throwError();
    }

    auto startObj = startValue.As<Napi::Object>();
    auto endObj = endValue.As<Napi::Object>();
    if ( !startObj.Has( "line" ) || !startObj.Has( "character" ) || !endObj.Has( "line" ) ||
         !endObj.Has( "character" ) )
    {
      return throwError();
    }

    auto startLineValue = startObj.Get( "line" );
    auto startCharacterValue = startObj.Get( "character" );
    auto endLineValue = endObj.Get( "line" );
    auto endCharacterValue = endObj.Get( "character" );
    if ( !startLineValue.IsNumber() || !startCharacterValue.IsNumber() ||
         !endLineValue.IsNumber() || !endCharacterValue.IsNumber() )
    {
      return throwError();
    }

    unsigned short startLine = startLineValue.As<Napi::Number>().Int32Value();
    unsigned short startCharacter = startCharacterValue.As<Napi::Number>().Int32Value();
    unsigned short endLine = endLineValue.As<Napi::Number>().Int32Value();
    unsigned short endCharacter = endCharacterValue.As<Napi::Number>().Int32Value();

    format_range = Compiler::Range( Compiler::Position{ startLine, startCharacter },
                                    Compiler::Position{ endLine, endCharacter } );
  }


  auto* lsp_workspace = LSPWorkspace::Unwrap( workspace.Value() );
  auto compiler = lsp_workspace->make_compiler();

  auto oldFormatterTabWidth = compilercfg.FormatterTabWidth;
  auto oldFormatterUseTabs = compilercfg.FormatterUseTabs;
  try
  {
    compilercfg.FormatterTabWidth = tabSize;
    compilercfg.FormatterUseTabs = !insertSpaces;
    auto formatted_string =
        compiler->to_formatted_string( pathname(), type == LSPDocumentType::EM, format_range );
    compilercfg.FormatterTabWidth = oldFormatterTabWidth;
    compilercfg.FormatterUseTabs = oldFormatterUseTabs;
    return Napi::String::New( env, formatted_string );
  }
  catch ( std::exception& ex )
  {
    compilercfg.FormatterTabWidth = oldFormatterTabWidth;
    compilercfg.FormatterUseTabs = oldFormatterUseTabs;
    return throwError(ex.what());
  }
}

}  // namespace VSCodeEscript
