#include "SemanticContextFinder.h"
#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/FunctionCall.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/ModuleFunctionDeclaration.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/ast/VarStatement.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/model/CompilerWorkspace.h"
#include "bscript/compiler/model/Variable.h"

using namespace Pol::Bscript::Compiler;

namespace VSCodeEscript::CompilerExt
{
SemanticContextFinder::SemanticContextFinder( CompilerWorkspace& workspace,
                                              const Position& position )
    : workspace( workspace ), position( position )
{
}

std::optional<std::string> SemanticContextFinder::hover( const Position& )
{
  workspace.accept( *this );
  if ( !nodes.empty() )
  {
    auto node = nodes.back();
    nodes.pop_back();
    if ( auto* function_call = dynamic_cast<FunctionCall*>( node ) )
    {
      bool added = false;
      std::string result = "(function) ";
      result += function_call->method_name;
      result += "(";
      auto params = function_call->parameters();
      if ( params )
      {
        for ( const auto& param_ref : *params )
        {
          auto& param = param_ref.get();
          if ( added )
          {
            result += ", ";
          }
          else
          {
            added = true;
          }
          result += param.name;
          auto* default_value = param.default_value();
          if ( default_value )
          {
            result += " := ";
            result += default_value->describe();
          }
        }
      }
      else
      {
        result += "<unknown>";
      }
      result += ")";
      return result;
    }
    else if ( auto* var_stmt = dynamic_cast<VarStatement*>( node ) )
    {
      std::string result = "(variable) ";
      result += var_stmt->name;
      return result;
    }
    else if ( auto* const_stmt = dynamic_cast<ConstDeclaration*>( node ) )
    {
      std::string result = "(constant) ";
      result += const_stmt->identifier;
      result += " := ";
      result += const_stmt->expression().describe();
      return result;
    }
    else if ( auto* identifier = dynamic_cast<Identifier*>( node ) )
    {
      auto name = identifier->name;

      if ( auto variable = identifier->variable )
      {
        std::string result = "(variable) ";
        result += name;
        return result;
      }
    }
  }
  return std::nullopt;
}

void SemanticContextFinder::visit_const_declaration( ConstDeclaration& const_decl )
{
  // Maybe SourceLocation::contains can have a pathname check too
  if ( const_decl.source_location.source_file_identifier->pathname == workspace.source->pathname &&
       const_decl.source_location.contains( position ) )
  {
    nodes.push_back( &const_decl );
    visit_children( const_decl );
  }
}

void SemanticContextFinder::visit_children( Node& parent )
{
  for ( const auto& child : parent.children )
  {
    if ( child->source_location.source_file_identifier->pathname == workspace.source->pathname &&
         child->source_location.contains( position ) )
    {
      nodes.push_back( child.get() );
      child->accept( *this );
      break;
    }
  }
}
}  // namespace VSCodeEscript::CompilerExt