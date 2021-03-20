#include <napi.h>

#include "bscript/compiler/Compiler.h"
#include "bscript/compiler/Profile.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/astbuilder/BuilderWorkspace.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceFileCache.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/file/SourceFileLoader.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compilercfg.h"
#include <memory>

using namespace Pol::Bscript;

class CustomLoader : public Compiler::SourceFileLoader
{
  std::string get_contents( const std::string& pathname ) const override
  {
    if ( pathname.find( "test.src" ) != std::string::npos )
    {
      return "include \"incfile\";\n\nconst global_const := 3;\nvar global_var := "
             "4;\n\nprint(\"Hello!\");\n\nprogram hello(scope1a, scope1b, scope1c)\n    if (1)\n   "
             "     var scope2a, scope2b;\n        foreach scope3a in scope2a\n            var "
             "global_var;\n        endforeach\n        newfunc();\n    endif\n    if (1)\n        "
             "var scope2a, scope2b;\n        foreach scope3a in scope2a\n            var scope4;\n "
             "       endforeach\n        newfunc();\n    endif\nendprogram\n\nfunction "
             "newfunc(scope5a := 5)\n    var scope5b;\nendfunction\n";
    }
    return SourceFileLoader::get_contents( pathname );
  }
};

Compiler::Profile profile;
CustomLoader source_loader;
Compiler::SourceFileCache em_parse_tree_cache( source_loader, profile );
Compiler::SourceFileCache inc_parse_tree_cache( source_loader, profile );

Napi::Value Method( const Napi::CallbackInfo& info )
{
  Napi::Env env = info.Env();

  compilercfg.Read(
      "/Users/kevineady/Documents/Projects/polserver/testsuite/escript/ecompile.cfg" );
  std::string pathname = "/Users/kevineady/Documents/Projects/polserver/bin-build/test.src";

  auto compiler = std::make_unique<Compiler::Compiler>( source_loader, em_parse_tree_cache,
                                                        inc_parse_tree_cache, profile );

  Compiler::DiagnosticReporter reporter;
  Compiler::Report report( reporter );

  auto workspace = compiler->precompile( pathname, report );

  auto diagnostics = Napi::Array::New( env );
  // size_t i = 0;
  auto push = diagnostics.Get( "push" ).As<Napi::Function>();

  for ( const auto& diagnostic : reporter.diagnostics )
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

    push.Call( diagnostics, { diag } );
  }

  return diagnostics;
}

Napi::Object Init( Napi::Env env, Napi::Object exports )
{
  exports.Set( Napi::String::New( env, "hello" ), Napi::Function::New( env, Method ) );
  return exports;
}

NODE_API_MODULE( hello, Init )
