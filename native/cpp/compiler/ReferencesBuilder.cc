#include "ReferencesBuilder.h"

#include "bscript/compiler/ast/FunctionCall.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/FunctionLink.h"
#include <filesystem>

namespace fs = std::filesystem;
using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{


class VariableFinder : public NodeVisitor
{
public:
  VariableFinder( std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
      : variable( variable )
  {
  }

  void visit_identifier( Identifier& node ) override
  {
    if ( node.variable == variable )
    {
      results.push_back( node.source_location );
    }

    visit_children( node );
  };

  std::vector<SourceLocation> results;

  const std::shared_ptr<Pol::Bscript::Compiler::Variable> variable;
};

class UserFunctionFinder : public NodeVisitor
{
public:
  UserFunctionFinder( UserFunction* user_function ) : user_function( user_function ) {}

  void visit_function_call( FunctionCall& node ) override
  {
    if ( auto link = node.function_link )
    {
      if ( link->user_function() == user_function )
      {
        results.push_back( node.source_location );
      }
      // else if ( link->module_function_declaration() == user_function )
      // {
      //   results.push_back( node.source_location );
      // }
    }

    visit_children( node );
  };

  std::vector<SourceLocation> results;

  const UserFunction* user_function;
};

ReferencesBuilder::ReferencesBuilder( CompilerWorkspace& workspace, const Position& position )
    : SemanticContextBuilder( workspace, position )
{
}

std::optional<ReferencesResult> ReferencesBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  auto ext = fs::path( variable->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".inc" );

  if ( is_source )
  {
    VariableFinder foo( variable );
    workspace.accept( foo );
    return foo.results;
  }
  else
  {
    // TODO check where this include file's variable is used in referenced includes _and_ all other
    // srcs
  }

  return std::nullopt;
}

std::optional<ReferencesResult> ReferencesBuilder::get_user_function( UserFunction* funct )
{
  auto ext = fs::path( funct->source_location.source_file_identifier->pathname ).extension();
  auto is_source = !ext.compare( ".src" );

  if ( is_source )
  {
    UserFunctionFinder foo( funct );
    workspace.accept( foo );
    return foo.results;
  }
  else
  {
    // TODO check where this include file's variable is used in referenced includes _and_ all other
    // srcs
  }
  return std::nullopt;
}

}  // namespace VSCodeEscript::CompilerExt