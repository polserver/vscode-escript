#include "CompletionBuilder.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;

namespace VSCodeEscript::CompilerExt
{
CompletionBuilder::CompletionBuilder( CompilerWorkspace& workspace, const Position& position )
    : workspace( workspace ), position( position )
{
}

std::vector<CompletionItem> CompletionBuilder::context()
{
  std::vector<CompletionItem> results;
  if ( workspace.source )
  {
    workspace.source->accept( *this );
    if ( !nodes.empty() )
    {
      {
        auto result = workspace.source->get_token_at( position );
        auto prefix = result ? result->getText().substr(
                                   0, position.character_column - result->getCharPositionInLine() + 1 )
                             : "";
        for ( auto* constant : workspace.scope_tree.list_constants( prefix ) )
        {
          results.push_back( CompletionItem{ constant->identifier, CompletionItemKind::Constant } );
        }

        for ( auto variable : workspace.scope_tree.list_variables( prefix, position ) )
        {
          results.push_back( CompletionItem{ variable->name, CompletionItemKind::Variable } );
        }

        for ( auto* user_function : workspace.scope_tree.list_user_functions( prefix ) )
        {
          results.push_back( CompletionItem{ user_function->name, CompletionItemKind::Function } );
        }

        for ( auto* module_function : workspace.scope_tree.list_module_functions( prefix ) )
        {
          results.push_back(
              CompletionItem{ module_function->name, CompletionItemKind::Function } );
        }
      }
    }
  }
  return results;
}

antlrcpp::Any CompletionBuilder::visitChildren( antlr4::tree::ParseTree* node )
{
  for ( auto* child : node->children )
  {
    if ( auto* ctx = dynamic_cast<antlr4::ParserRuleContext*>( child ) )
    {
      Pol::Bscript::Compiler::SourceLocation sl(
          workspace.referenced_source_file_identifiers.front().get(), *ctx );
      if ( sl.contains( position ) )
      {
        nodes.push_back( ctx );
      }
    }
    child->accept( this );
  }

  return antlrcpp::Any();
}

}  // namespace VSCodeEscript::CompilerExt