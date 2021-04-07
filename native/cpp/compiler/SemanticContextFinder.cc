#include "SemanticContextFinder.h"
#include "bscript/compiler/ast/ConstDeclaration.h"
#include "bscript/compiler/ast/Expression.h"
#include "bscript/compiler/ast/Function.h"
#include "bscript/compiler/ast/FunctionBody.h"
#include "bscript/compiler/ast/FunctionCall.h"
#include "bscript/compiler/ast/FunctionParameterDeclaration.h"
#include "bscript/compiler/ast/Identifier.h"
#include "bscript/compiler/ast/IfThenElseStatement.h"
#include "bscript/compiler/ast/IntegerValue.h"
#include "bscript/compiler/ast/MemberAccess.h"
#include "bscript/compiler/ast/MethodCall.h"
#include "bscript/compiler/ast/UserFunction.h"
#include "bscript/compiler/ast/Value.h"
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

  auto parameters_to_string =
      [&]( std::vector<std::reference_wrapper<FunctionParameterDeclaration>> params )
      -> std::string {
    bool added = false;
    std::string result;
    for ( const auto& param_ref : params )
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
    return result;
  };

  while ( !nodes.empty() )
  {
    auto node = nodes.back();
    nodes.pop_back();
    if ( auto* function_def = dynamic_cast<Function*>( node ) )
    {
      bool added = false;
      std::string result = "(function) ";
      result += function_def->name;
      result += "(";
      result += parameters_to_string( function_def->parameters() );
      result += ")";
      return result;
    }
    else if ( auto* function_call = dynamic_cast<FunctionCall*>( node ) )
    {
      bool added = false;
      std::string result = "(function) ";
      result += function_call->method_name;
      result += "(";
      auto params = function_call->parameters();
      if ( params )
      {
        result += parameters_to_string( *params );
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
        std::string result = ( variable->scope == VariableScope::Global ? "(global variable) "
                                                                        : "(local variable) " );
        result += name;
        return result;
      }
      break;
    }
    else if ( auto* member_access = dynamic_cast<MemberAccess*>( node ) )
    {
      std::string result = "(member) ";
      result += member_access->name;
      return result;
    }
    else if ( auto* funct_param = dynamic_cast<FunctionParameterDeclaration*>( node ) )
    {
      std::string result = "(parameter) ";
      result += funct_param->name;
      return result;
    }
    else if ( auto* value = dynamic_cast<Value*>( node ) )
    {
      // Constants are optimized away and are only shown as values. But, this
      // will also hover normal values like strings.
      std::string result = "(value) ";
      result += value->describe();
      return result;
    }
    else if ( auto* method_call = dynamic_cast<MethodCall*>( node ) )
    {
      // Methods do not have known argument names.
      std::string result = "(method) ";
      result += method_call->methodname;
      return result;
    }
  }
  return std::nullopt;
}

void SemanticContextFinder::visit_user_function( UserFunction& node )
{
  // Maybe SourceLocation::contains can have a pathname check too
  if ( node.source_location.source_file_identifier->pathname == workspace.source->pathname &&
       node.source_location.contains( position ) )
  {
    nodes.push_back( &node );
    visit_children( node );
  }
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
    if ( child )
    {
      if ( child->source_location.source_file_identifier->pathname == workspace.source->pathname &&
           child->source_location.contains( position ) )
      {
        nodes.push_back( child.get() );
      }
      child->accept( *this );
    }
  }
}
}  // namespace VSCodeEscript::CompilerExt