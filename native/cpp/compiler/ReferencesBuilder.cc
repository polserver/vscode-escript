#include "ReferencesBuilder.h"

#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"

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

ReferencesBuilder::ReferencesBuilder( CompilerWorkspace& workspace, const Position& position,
                                      bool is_source )
    : SemanticContextBuilder( workspace, position ), is_source( is_source )
{
}

std::optional<ReferencesResult> ReferencesBuilder::get_variable(
    std::shared_ptr<Pol::Bscript::Compiler::Variable> variable )
{
  if ( is_source )
  {
    VariableFinder foo( variable );
    workspace.accept( foo );
    return foo.results;
  }
  else
  {
    // TODO check where this include file's variable is used in referenced includes _and_ all other srcs
  }

  return std::nullopt;
}
}  // namespace VSCodeEscript::CompilerExt