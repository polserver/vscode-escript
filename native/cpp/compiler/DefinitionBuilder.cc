#include "DefinitionBuilder.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
DefinitionBuilder::DefinitionBuilder( CompilerWorkspace& workspace, const Position& position )
    : SemanticContextBuilder( workspace, position )
{
}

std::optional<Pol::Bscript::Compiler::SourceLocation> DefinitionBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  return function_def->source_location;
}

}  // namespace VSCodeEscript::CompilerExt