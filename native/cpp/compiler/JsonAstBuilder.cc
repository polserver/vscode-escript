#include "JsonAstBuilder.h"

#include "bscript/compiler/Profile.h"
#include "bscript/compiler/Report.h"
#include "bscript/compiler/ast/Node.h"
#include "bscript/compiler/ast/Program.h"
#include "bscript/compiler/ast/TopLevelStatements.h"
#include "bscript/compiler/file/SourceFile.h"
#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compiler/file/SourceFileLoader.h"
#include "bscript/compiler/model/CompilerWorkspace.h"

using namespace Pol::Bscript;

namespace VSCodeEscript::CompilerExt
{
JsonAstBuilder::JsonAstBuilder( Napi::Env env ) : env( env ), position_map() {}

Napi::Value JsonAstBuilder::get_ast( const Compiler::SourceFileLoader& source_loader,
                                     const std::string& pathname, bool is_module )
{
  auto ident = std::make_unique<Compiler::SourceFileIdentifier>( 0, pathname );
  auto ast_reporter = std::make_unique<Compiler::DiagnosticReporter>();
  auto ast_report = std::make_unique<Compiler::Report>( *ast_reporter );
  Compiler::Profile ast_profile;

  auto sf = Compiler::SourceFile::load( *ident, source_loader, ast_profile, *ast_report );

  auto throw_if_error = [&]()
  {
    if ( ast_report->error_count() )
    {
      for ( const auto& diagnostic : ast_reporter->diagnostics )
      {
        if ( diagnostic.severity == Pol::Bscript::Compiler::Diagnostic::Severity::Error )
        {
          throw std::runtime_error( fmt::format( "Compilation error: {}", diagnostic.message ) );
        }
      }
      throw std::runtime_error( "Unknown error" );
    }
  };

  throw_if_error();

  antlr4::ParserRuleContext* ctx;
  if ( is_module )
    ctx = sf->get_module_unit( *ast_report, *ident );
  else
    ctx = sf->get_compilation_unit( *ast_report, *ident );

  throw_if_error();

  Napi::Array comments = Napi::Array::New( env );
  auto push = comments.Get( "push" ).As<Napi::Function>();

  volatile size_t start = 0;
  volatile size_t end = 0;

  std::string token_text;
  for ( auto* tok : sf->get_all_tokens() )
  {
    token_text = tok->getText();
    end += tok->getType() == EscriptGrammar::EscriptLexer::EOF ? 0 : token_text.size();
    position_map.insert( { tok, { start, end } } );
    start = end;

    if ( tok->getType() == EscriptGrammar::EscriptLexer::COMMENT )
    {
      push.Call( comments, { new_node( tok, "comment",           //
                                       "value", tok->getText(),  //
                                       "text", tok->getText()    //
                                       ) } );
    }
    else if ( tok->getType() == EscriptGrammar::EscriptLexer::LINE_COMMENT )
    {
      push.Call( comments, { new_node( tok, "line-comment",      //
                                       "value", tok->getText(),  //
                                       "text", tok->getText()    //
                                       ) } );
    }
  }

  auto any_ast = ctx->accept( this );
  Napi::Value ast = std::any_cast<Napi::Value>( any_ast );

  ast.As<Napi::Object>()["comments"] = comments;

  return ast;
}

antlrcpp::Any JsonAstBuilder::defaultResult()
{
  return Napi::Value( Napi::Array::New( env ) );
}

antlrcpp::Any JsonAstBuilder::aggregateResult( antlrcpp::Any aggregate, antlrcpp::Any nextResult )
{
  auto accum = std::any_cast<Napi::Value>( aggregate );
  auto next_res = std::any_cast<Napi::Value>( nextResult );

  if ( accum.IsArray() )
  {
    auto accum_array = accum.As<Napi::Array>();
    auto push = accum_array.Get( "push" ).As<Napi::Function>();
    if ( next_res.IsArray() )
    {
      for ( auto x : next_res.As<Napi::Array>() )
      {
        push.Call( accum, { x.second } );
      }
    }
    else
    {
      push.Call( accum, { next_res } );
    }
  }

  return accum;
}

Napi::Value& JsonAstBuilder::add( Napi::Value& v )
{
  return v;
}

template <typename T>
Napi::Value JsonAstBuilder::to_value( T arg )
{
  return Napi::Value::From( env, arg );
}

template <>
Napi::Value JsonAstBuilder::to_value( antlrcpp::Any arg )
{
  if ( arg.has_value() )
    return std::any_cast<Napi::Value>( arg );

  return env.Null();
}

template <typename T1, typename... Types>
Napi::Value& JsonAstBuilder::add( Napi::Value& v, const std::string& var1, T1 var2, Types... var3 )
{
  if ( v.IsObject() )
  {
    v.As<Napi::Object>().Set( var1, to_value( var2 ) );
  }
  return add( v, var3... );
}

template <typename T1, typename... Types>
Napi::Value JsonAstBuilder::add( antlrcpp::Any any_v, const std::string& var1, T1 var2,
                                 Types... var3 )
{
  auto v = std::any_cast<Napi::Value>( any_v );
  return add( v, var1, var2, var3... );
}

std::tuple<size_t, size_t> JsonAstBuilder::position( antlr4::tree::TerminalNode* terminal )
{
  return position( terminal->getSymbol() );
}

std::tuple<size_t, size_t> JsonAstBuilder::position( antlr4::Token* token )
{
  auto iter = position_map.find( token );
  if ( iter == position_map.end() )
  {
    throw std::runtime_error( "No position antlr4::Token* token" );
  }
  return iter->second;
}

std::tuple<size_t, size_t> JsonAstBuilder::position( antlr4::ParserRuleContext* ctx )
{
  auto start_iter = position_map.find( ctx->start );
  if ( start_iter == position_map.end() )
  {
    throw std::runtime_error( "No position antlr4::ParserRuleContext* start" );
  }
  auto end_iter = position_map.find( ctx->stop );
  if ( end_iter == position_map.end() )
  {
    throw std::runtime_error( "No position antlr4::ParserRuleContext* stop" );
  }
  return { std::get<0>( start_iter->second ), std::get<1>( end_iter->second ) };
}

template <typename Rangeable>
Pol::Bscript::Compiler::Range get_range( Rangeable ctx )
{
  return Pol::Bscript::Compiler::Range( *ctx );
}

template <>
Pol::Bscript::Compiler::Range get_range( antlr4::Token* token )
{
  return Pol::Bscript::Compiler::Range( token );
}

template <typename Rangeable, typename... Types>
Napi::Value JsonAstBuilder::new_node( Rangeable ctx, const std::string& type, Types... var3 )
{
  Napi::Object w = Napi::Object::New( env );
  auto range = get_range( ctx );

  auto pos = position( ctx );

  w["type"] = type;

  Napi::Object start = Napi::Object::New( env );
  start["line_number"] = range.start.line_number;
  start["character_column"] = range.start.character_column;
  start["token_index"] = range.start.token_index;
  start["index"] = std::get<0>( pos );

  Napi::Object end = Napi::Object::New( env );
  end["line_number"] = range.end.line_number;
  end["character_column"] = range.end.character_column;
  end["token_index"] = range.end.token_index;
  end["index"] = std::get<1>( pos );

  w["start"] = start;
  w["end"] = end;

  add( w, var3... );
  return w;
};

antlrcpp::Any JsonAstBuilder::visitCompilationUnit(
    EscriptGrammar::EscriptParser::CompilationUnitContext* ctx )
{
  return new_node( ctx, "file",                   //
                   "body", visitChildren( ctx ),  //
                   "module", false                //
  );
}

antlrcpp::Any JsonAstBuilder::visitVarStatement(
    EscriptGrammar::EscriptParser::VarStatementContext* ctx )
{
  auto declarations = visitVariableDeclarationList( ctx->variableDeclarationList() );

  return new_node( ctx, "var-statement",         //
                   "declarations", declarations  //
  );
}

antlrcpp::Any JsonAstBuilder::visitWhileStatement(
    EscriptGrammar::EscriptParser::WhileStatementContext* ctx )
{
  auto label = make_statement_label( ctx->statementLabel() );
  auto body = visitBlock( ctx->block() );
  auto test = visitExpression( ctx->parExpression()->expression() );

  return new_node( ctx, "while-statement",  //
                   "label", label,          //
                   "test", test,            //
                   "body", body             //
  );
}

antlrcpp::Any JsonAstBuilder::visitVariableDeclaration(
    EscriptGrammar::EscriptParser::VariableDeclarationContext* ctx )
{
  antlrcpp::Any init;

  if ( auto variable_declaration_initializer = ctx->variableDeclarationInitializer() )
  {
    if ( auto expression = variable_declaration_initializer->expression() )
    {
      init = visitExpression( expression );
    }

    else if ( auto array = variable_declaration_initializer->ARRAY() )
    {
      init = new_node( ctx, "array-expression",     //
                       "elements", defaultResult()  //
      );
    }
  }

  return new_node( ctx, "variable-declaration",                   //
                   "name", make_identifier( ctx->IDENTIFIER() ),  //
                   "init", init                                   //
  );
}

antlrcpp::Any JsonAstBuilder::visitConstStatement(
    EscriptGrammar::EscriptParser::ConstStatementContext* ctx )
{
  auto const_declaration_ctx = ctx->constantDeclaration();
  antlrcpp::Any init;

  if ( auto variable_declaration_initializer =
           const_declaration_ctx->variableDeclarationInitializer() )
  {
    if ( auto expression = variable_declaration_initializer->expression() )
    {
      init = visitExpression( expression );
    }

    else if ( auto array = variable_declaration_initializer->ARRAY() )
    {
      init = new_node( ctx, "array-expression",     //
                       "elements", defaultResult()  //
      );
    }
  }

  return new_node( ctx, "const-statement",                                          //
                   "name", make_identifier( const_declaration_ctx->IDENTIFIER() ),  //
                   "init", init                                                     //
  );
}

antlrcpp::Any JsonAstBuilder::visitDictInitializerExpression(
    EscriptGrammar::EscriptParser::DictInitializerExpressionContext* ctx )
{
  antlrcpp::Any init;

  if ( ctx->expression().size() > 1 )
  {
    init = visitExpression( ctx->expression( 1 ) );
  }

  return new_node( ctx, "dictionary-initializer",                   //
                   "key", visitExpression( ctx->expression( 0 ) ),  //
                   "value", init                                    //
  );
}

antlrcpp::Any JsonAstBuilder::visitDoStatement(
    EscriptGrammar::EscriptParser::DoStatementContext* ctx )
{
  auto label = make_statement_label( ctx->statementLabel() );
  auto body = visitBlock( ctx->block() );
  auto test = visitExpression( ctx->parExpression()->expression() );

  return new_node( ctx, "do-statement",  //
                   "label", label,       //
                   "test", test,         //
                   "body", body          //
  );
}

antlrcpp::Any JsonAstBuilder::visitEnumListEntry(
    EscriptGrammar::EscriptParser::EnumListEntryContext* ctx )
{
  antlrcpp::Any value;
  auto identifier = make_identifier( ctx->IDENTIFIER() );

  if ( auto expression = ctx->expression() )
  {
    value = visitExpression( expression );
  }

  return new_node( ctx, "enum-entry",         //
                   "identifier", identifier,  //
                   "value", value             //
  );
}

antlrcpp::Any JsonAstBuilder::visitEnumStatement(
    EscriptGrammar::EscriptParser::EnumStatementContext* ctx )
{
  auto identifier = make_identifier( ctx->IDENTIFIER() );
  auto enums = visitEnumList( ctx->enumList() );

  return new_node( ctx, "enum-statement",     //
                   "identifier", identifier,  //
                   "enums", enums             //
  );
}

antlrcpp::Any JsonAstBuilder::visitExitStatement(
    EscriptGrammar::EscriptParser::ExitStatementContext* ctx )
{
  return new_node( ctx, "exit-statement" );
}

antlrcpp::Any JsonAstBuilder::visitExplicitArrayInitializer(
    EscriptGrammar::EscriptParser::ExplicitArrayInitializerContext* ctx )
{
  return new_node( ctx, "array-expression",          //
                   "elements", visitChildren( ctx )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitExplicitDictInitializer(
    EscriptGrammar::EscriptParser::ExplicitDictInitializerContext* ctx )
{
  return new_node( ctx, "dictionary-expression",    //
                   "entries", visitChildren( ctx )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitExplicitErrorInitializer(
    EscriptGrammar::EscriptParser::ExplicitErrorInitializerContext* ctx )
{
  return new_node( ctx, "error-expression",         //
                   "members", visitChildren( ctx )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitBareArrayInitializer(
    EscriptGrammar::EscriptParser::BareArrayInitializerContext* ctx )
{
  return new_node( ctx, "array-expression",          //
                   "elements", visitChildren( ctx )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitExplicitStructInitializer(
    EscriptGrammar::EscriptParser::ExplicitStructInitializerContext* ctx )
{
  return new_node( ctx, "struct-expression",        //
                   "members", visitChildren( ctx )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitExpression(
    EscriptGrammar::EscriptParser::ExpressionContext* ctx )
{
  if ( auto prim = ctx->primary() )
    return visitPrimary( prim );
  else if ( ctx->prefix )
    return new_node( ctx, "unary-expression",                             //
                     "prefix", true,                                      //
                     "operator", ctx->prefix->getText(),                  //
                     "argument", visitExpression( ctx->expression( 0 ) )  //
    );

  else if ( ctx->postfix )
    return new_node( ctx, "unary-expression",                             //
                     "prefix", false,                                     //
                     "operator", ctx->postfix->getText(),                 //
                     "argument", visitExpression( ctx->expression( 0 ) )  //
    );

  else if ( ctx->bop && ctx->expression().size() == 2 )
  {
    return new_node( ctx, "binary-expression",                         //
                     "left", visitExpression( ctx->expression( 0 ) ),  //
                     "operator", ctx->bop->getText(),                  //
                     "right", visitExpression( ctx->expression( 1 ) )  //
    );
  }
  else if ( auto suffix = ctx->expressionSuffix() )
  {
    return expression_suffix( ctx->expression( 0 ), suffix );
  }
  else if ( ctx->QUESTION() )
  {
    return new_node( ctx, "conditional-expression",                           //
                     "conditional", visitExpression( ctx->expression( 0 ) ),  //
                     "consequent", visitExpression( ctx->expression( 1 ) ),   //
                     "alternate", visitExpression( ctx->expression( 2 ) )     //
    );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::expression_suffix(
    EscriptGrammar::EscriptParser::ExpressionContext* expr_ctx,
    EscriptGrammar::EscriptParser::ExpressionSuffixContext* expr_suffix_ctx )
{
  if ( auto indexing = expr_suffix_ctx->indexingSuffix() )
  {
    return new_node( expr_ctx, "element-access-expression",                         //
                     "indexes", visitExpressionList( indexing->expressionList() ),  //
                     "entity", visitExpression( expr_ctx )                          //
    );
  }
  else if ( auto member = expr_suffix_ctx->navigationSuffix() )
  {
    antlrcpp::Any accessor;

    if ( auto string_literal = member->STRING_LITERAL() )
    {
      accessor = make_string_literal( string_literal );
    }
    else if ( auto identifier = member->IDENTIFIER() )
    {
      accessor = make_identifier( identifier );
    }

    return new_node( expr_ctx, "member-access-expression",  //
                     "name", accessor,                      //
                     "entity", visitExpression( expr_ctx )  //
    );
  }
  else if ( auto method = expr_suffix_ctx->methodCallSuffix() )
  {
    return new_node( expr_ctx, "method-call-expression",               //
                     "name", make_identifier( method->IDENTIFIER() ),  //
                     "arguments", visitChildren( method ),             //
                     "entity", visitExpression( expr_ctx )             //
    );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitFloatLiteral(
    EscriptGrammar::EscriptParser::FloatLiteralContext* ctx )
{
  if ( auto float_literal = ctx->FLOAT_LITERAL() )
    return make_float_literal( float_literal );
  else if ( auto hex_float_literal = ctx->HEX_FLOAT_LITERAL() )
    return make_float_literal( hex_float_literal );

  return visitChildren( ctx );
}

antlrcpp::Any JsonAstBuilder::visitForeachIterableExpression(
    EscriptGrammar::EscriptParser::ForeachIterableExpressionContext* ctx )
{
  if ( auto parExpression = ctx->parExpression() )
  {
    return visitExpression( parExpression->expression() );
  }
  else if ( auto functionCall = ctx->functionCall() )
  {
    return visitFunctionCall( functionCall );
  }
  else if ( auto scopedFunctionCall = ctx->scopedFunctionCall() )
  {
    return visitScopedFunctionCall( scopedFunctionCall );
  }
  else if ( auto identifier = ctx->IDENTIFIER() )
  {
    return make_identifier( identifier );
  }
  else if ( auto explicitArrayInitializer = ctx->explicitArrayInitializer() )
  {
    return visitExplicitArrayInitializer( explicitArrayInitializer );
  }
  else if ( auto bareArrayInitializer = ctx->bareArrayInitializer() )
  {
    return visitBareArrayInitializer( bareArrayInitializer );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitForeachStatement(
    EscriptGrammar::EscriptParser::ForeachStatementContext* ctx )
{
  auto identifier = make_identifier( ctx->IDENTIFIER() );
  auto label = make_statement_label( ctx->statementLabel() );
  auto expression = visitForeachIterableExpression( ctx->foreachIterableExpression() );
  auto body = visitBlock( ctx->block() );

  return new_node( ctx, "foreach-statement",  //
                   "identifier", identifier,  //
                   "expression", expression,  //
                   "label", label,            //
                   "body", body               //
  );
}

antlrcpp::Any JsonAstBuilder::visitForStatement(
    EscriptGrammar::EscriptParser::ForStatementContext* ctx )
{
  auto label = make_statement_label( ctx->statementLabel() );

  auto forGroup = ctx->forGroup();

  if ( auto basicForStatement = forGroup->basicForStatement() )
  {
    return add( visitBasicForStatement( basicForStatement ),  //
                "label", label                                //
    );
  }
  else if ( auto cstyleForStatement = forGroup->cstyleForStatement() )
  {
    return add( visitCstyleForStatement( cstyleForStatement ),  //
                "label", label                                  //
    );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitFunctionCall(
    EscriptGrammar::EscriptParser::FunctionCallContext* ctx )
{
  return new_node( ctx, "function-call-expression",                 //
                   "callee", make_identifier( ctx->IDENTIFIER() ),  //
                   "arguments", visitChildren( ctx ),               //
                   "scope", env.Null()                              //
  );
}
antlrcpp::Any JsonAstBuilder::visitFunctionDeclaration(
    EscriptGrammar::EscriptParser::FunctionDeclarationContext* ctx )
{
  bool exported = ctx->EXPORTED();
  auto name = make_identifier( ctx->IDENTIFIER() );
  auto parameters = visitFunctionParameters( ctx->functionParameters() );
  auto body = visitBlock( ctx->block() );

  return new_node( ctx, "function-declaration",  //
                   "name", name,                 //
                   "parameters", parameters,     //
                   "exported", exported,         //
                   "body", body                  //
  );
}
antlrcpp::Any JsonAstBuilder::visitFunctionParameter(
    EscriptGrammar::EscriptParser::FunctionParameterContext* ctx )
{
  antlrcpp::Any init;
  bool byref = ctx->BYREF();
  bool unused = ctx->UNUSED();
  auto name = make_identifier( ctx->IDENTIFIER() );

  if ( auto expression = ctx->expression() )
  {
    init = visitExpression( expression );
  }

  return new_node( ctx, "function-parameter",  //
                   "name", name,               //
                   "init", init,               //
                   "byref", byref,             //
                   "unused", unused            //
  );
}

antlrcpp::Any JsonAstBuilder::visitBreakStatement(
    EscriptGrammar::EscriptParser::BreakStatementContext* ctx )
{
  antlrcpp::Any label;

  if ( auto identifier = ctx->IDENTIFIER() )
  {
    label = make_identifier( identifier );
  }

  return new_node( ctx, "break-statement",  //
                   "label", label           //
  );
}

antlrcpp::Any JsonAstBuilder::visitSwitchBlockStatementGroup(
    EscriptGrammar::EscriptParser::SwitchBlockStatementGroupContext* ctx )
{
  auto labels = defaultResult();
  for ( const auto& switchLabel : ctx->switchLabel() )
  {
    labels = aggregateResult( labels, visitSwitchLabel( switchLabel ) );
  }

  auto body = visitBlock( ctx->block() );

  return new_node( ctx, "switch-block",  //
                   "labels", labels,     //
                   "body", body          //
  );
}

antlrcpp::Any JsonAstBuilder::visitSwitchLabel(
    EscriptGrammar::EscriptParser::SwitchLabelContext* ctx )
{
  if ( auto integerLiteral = ctx->integerLiteral() )
  {
    return visitIntegerLiteral( integerLiteral );
  }
  else if ( auto boolLiteral = ctx->boolLiteral() )
  {
    return visitBoolLiteral( boolLiteral );
  }
  else if ( auto uninit = ctx->UNINIT() )
  {
    return new_node( uninit, "uninitialized-value" );
  }
  else if ( auto identifier = ctx->IDENTIFIER() )
  {
    return make_identifier( identifier );
  }
  else if ( auto string_literal = ctx->STRING_LITERAL() )
  {
    return make_string_literal( string_literal );
  }
  else if ( ctx->DEFAULT() )
  {
    return new_node( ctx->DEFAULT(), "default-case-label" );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitCaseStatement(
    EscriptGrammar::EscriptParser::CaseStatementContext* ctx )
{
  auto label = make_statement_label( ctx->statementLabel() );
  auto test = visitExpression( ctx->expression() );

  auto cases = defaultResult();
  for ( const auto& switchBlockStatementGroup : ctx->switchBlockStatementGroup() )
  {
    cases = aggregateResult( cases, visitSwitchBlockStatementGroup( switchBlockStatementGroup ) );
  }

  return new_node( ctx, "case-statement",  //
                   "label", label,         //
                   "test", test,           //
                   "cases", cases          //
  );
}

antlrcpp::Any JsonAstBuilder::visitContinueStatement(
    EscriptGrammar::EscriptParser::ContinueStatementContext* ctx )
{
  antlrcpp::Any label;

  if ( auto identifier = ctx->IDENTIFIER() )
  {
    label = make_identifier( identifier );
  }

  return new_node( ctx, "continue-statement",  //
                   "label", label              //
  );
}

antlrcpp::Any JsonAstBuilder::visitBasicForStatement(
    EscriptGrammar::EscriptParser::BasicForStatementContext* ctx )
{
  auto identifier = make_identifier( ctx->IDENTIFIER() );
  auto first = visitExpression( ctx->expression( 0 ) );
  auto last = visitExpression( ctx->expression( 1 ) );

  return new_node( ctx, "basic-for-statement",  //
                   "identifier", identifier,    //
                   "first", first,              //
                   "last", last                 //
  );
}

antlrcpp::Any JsonAstBuilder::visitCstyleForStatement(
    EscriptGrammar::EscriptParser::CstyleForStatementContext* ctx )
{
  auto body = visitBlock( ctx->block() );
  auto initializer = visitExpression( ctx->expression( 0 ) );
  auto test = visitExpression( ctx->expression( 1 ) );
  auto advancer = visitExpression( ctx->expression( 2 ) );

  return new_node( ctx, "cstyle-for-statement",  //
                   "initializer", initializer,   //
                   "test", test,                 //
                   "advancer", advancer,         //
                   "body", body                  //
  );
}

antlrcpp::Any JsonAstBuilder::visitRepeatStatement(
    EscriptGrammar::EscriptParser::RepeatStatementContext* ctx )
{
  auto label = make_statement_label( ctx->statementLabel() );
  auto body = visitBlock( ctx->block() );
  auto test = visitExpression( ctx->expression() );

  return new_node( ctx, "repeat-statement",  //
                   "label", label,           //
                   "body", body,             //
                   "test", test              //
  );
}

antlrcpp::Any JsonAstBuilder::visitReturnStatement(
    EscriptGrammar::EscriptParser::ReturnStatementContext* ctx )
{
  antlrcpp::Any value;

  if ( auto expression = ctx->expression() )
  {
    value = visitExpression( expression );
  }

  return new_node( ctx, "return-statement",  //
                   "value", value            //
  );
}

antlrcpp::Any JsonAstBuilder::visitScopedFunctionCall(
    EscriptGrammar::EscriptParser::ScopedFunctionCallContext* ctx )
{
  return new_node( ctx, "function-call-expression",                                 //
                   "callee", make_identifier( ctx->functionCall()->IDENTIFIER() ),  //
                   "arguments", visitChildren( ctx->functionCall() ),               //
                   "scope", make_identifier( ctx->IDENTIFIER() )                    //
  );
}

antlrcpp::Any JsonAstBuilder::visitFunctionReference(
    EscriptGrammar::EscriptParser::FunctionReferenceContext* ctx )
{
  return new_node( ctx, "function-reference-expression",         //
                   "name", make_identifier( ctx->IDENTIFIER() )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitGotoStatement(
    EscriptGrammar::EscriptParser::GotoStatementContext* ctx )
{
  return new_node( ctx, "goto-statement",                         //
                   "label", make_identifier( ctx->IDENTIFIER() )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitIfStatement(
    EscriptGrammar::EscriptParser::IfStatementContext* ctx )
{
  auto blocks = ctx->block();
  auto par_expression = ctx->parExpression();

  antlrcpp::Any else_clause;

  auto num_if_branches = blocks.size();
  if ( ctx->ELSE() )
  {
    else_clause = visitBlock( blocks.at( blocks.size() - 1 ) );
  }

  Napi::Value if_statement_ast;

  size_t num_expressions = par_expression.size();
  for ( auto clause_index = num_expressions; clause_index != 0; )
  {
    --clause_index;
    auto expression_ctx = par_expression.at( clause_index );
    auto expression_ast = visitExpression( expression_ctx->expression() );
    antlrcpp::Any consequent_ast;

    if ( blocks.size() > clause_index )
    {
      consequent_ast = visitBlock( blocks.at( clause_index ) );
    }

    auto alternative_ast = if_statement_ast.IsEmpty() ? else_clause : if_statement_ast;

    bool elseif = clause_index != 0;

    if_statement_ast = new_node( ctx, "if-statement",             //
                                 "test", expression_ast,          //
                                 "consequent", consequent_ast,    //
                                 "alternative", alternative_ast,  //
                                 "elseif", elseif                 //
    );
  }

  return if_statement_ast;
}

antlrcpp::Any JsonAstBuilder::visitIncludeDeclaration(
    EscriptGrammar::EscriptParser::IncludeDeclarationContext* ctx )
{
  return new_node( ctx, "include-declaration",                                    //
                   "specifier", visitStringIdentifier( ctx->stringIdentifier() )  //
  );
}

antlrcpp::Any JsonAstBuilder::visitInterpolatedString(
    EscriptGrammar::EscriptParser::InterpolatedStringContext* ctx )
{
  return new_node( ctx, "interpolated-string-expression",  //
                   "parts", visitChildren( ctx )           //
  );
}

antlrcpp::Any JsonAstBuilder::visitInterpolatedStringPart(
    EscriptGrammar::EscriptParser::InterpolatedStringPartContext* ctx )
{
  antlrcpp::Any format;
  antlrcpp::Any expression;
  if ( auto expression_ctx = ctx->expression() )
  {
    expression = visitExpression( expression_ctx );

    if ( auto format_string = ctx->FORMAT_STRING() )
    {
      format = new_node( format_string, "format-string",    //
                         "value", format_string->getText()  //
      );
    }
  }

  else if ( auto string_literal = ctx->STRING_LITERAL_INSIDE() )
  {
    expression = make_string_literal( string_literal, string_literal->getText() );
  }
  else if ( auto lbrace = ctx->DOUBLE_LBRACE_INSIDE() )
  {
    expression = make_string_literal( lbrace, "{" );
  }
  else if ( auto rbrace = ctx->DOUBLE_RBRACE() )
  {
    expression = make_string_literal( rbrace, "}" );
  }
  else if ( auto escaped = ctx->REGULAR_CHAR_INSIDE() )
  {
    expression = make_string_literal( escaped, escaped->getText() );
  }

  return new_node( ctx, "interpolated-string-part",  //
                   "expression", expression,         //
                   "format", format                  //
  );
}

antlrcpp::Any JsonAstBuilder::visitBoolLiteral(
    EscriptGrammar::EscriptParser::BoolLiteralContext* ctx )
{
  if ( auto bool_false = ctx->BOOL_FALSE() )
  {
    return make_bool_literal( bool_false );
  }
  else if ( auto bool_true = ctx->BOOL_TRUE() )
  {
    return make_bool_literal( bool_true );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitIntegerLiteral(
    EscriptGrammar::EscriptParser::IntegerLiteralContext* ctx )
{
  if ( auto decimal_literal = ctx->DECIMAL_LITERAL() )
    return make_integer_literal( decimal_literal );

  else if ( auto hex_literal = ctx->HEX_LITERAL() )
    return make_integer_literal( hex_literal );

  else if ( auto oct_literal = ctx->OCT_LITERAL() )
    return make_integer_literal( oct_literal );

  else if ( auto binary_literal = ctx->BINARY_LITERAL() )
    return make_integer_literal( binary_literal );

  return visitChildren( ctx );
}

antlrcpp::Any JsonAstBuilder::visitLiteral( EscriptGrammar::EscriptParser::LiteralContext* ctx )
{
  if ( auto string_literal = ctx->STRING_LITERAL() )
  {
    return make_string_literal( string_literal );
  }
  else if ( auto integer_literal = ctx->integerLiteral() )
  {
    return visitIntegerLiteral( integer_literal );
  }
  else if ( auto float_literal = ctx->floatLiteral() )
  {
    return visitFloatLiteral( float_literal );
  }
  else if ( auto bool_literal = ctx->boolLiteral() )
  {
    return visitBoolLiteral( bool_literal );
  }
  else if ( auto uninit = ctx->UNINIT() )
  {
    return new_node( uninit, "uninitialized-value" );
  }
  return visitChildren( ctx );
}

antlrcpp::Any JsonAstBuilder::visitModuleFunctionDeclaration(
    EscriptGrammar::EscriptParser::ModuleFunctionDeclarationContext* ctx )
{
  auto name = make_identifier( ctx->IDENTIFIER() );
  antlrcpp::Any parameters;

  if ( auto moduleFunctionParameterList = ctx->moduleFunctionParameterList() )
  {
    parameters = visitModuleFunctionParameterList( ctx->moduleFunctionParameterList() );
  }
  else
  {
    parameters = defaultResult();
  }

  return new_node( ctx, "module-function-declaration",  //
                   "name", name,                        //
                   "parameters", parameters             //
  );
}

antlrcpp::Any JsonAstBuilder::visitModuleFunctionParameter(
    EscriptGrammar::EscriptParser::ModuleFunctionParameterContext* ctx )
{
  antlrcpp::Any init;
  auto name = make_identifier( ctx->IDENTIFIER() );

  if ( auto expression = ctx->expression() )
  {
    init = visitExpression( expression );
  }

  return new_node( ctx, "module-function-parameter",  //
                   "name", name,                      //
                   "init", init                       //
  );
}

antlrcpp::Any JsonAstBuilder::visitModuleUnit(
    EscriptGrammar::EscriptParser::ModuleUnitContext* ctx )
{
  return new_node( ctx, "file",                   //
                   "body", visitChildren( ctx ),  //
                   "module", true                 //
  );
}

antlrcpp::Any JsonAstBuilder::visitPrimary( EscriptGrammar::EscriptParser::PrimaryContext* ctx )
{
  if ( auto literal = ctx->literal() )
  {
    return visitLiteral( literal );
  }
  else if ( auto parExpression = ctx->parExpression() )
  {
    return visitExpression( parExpression->expression() );
  }
  else if ( auto functionCall = ctx->functionCall() )
  {
    return visitFunctionCall( functionCall );
  }
  else if ( auto scopedFunctionCall = ctx->scopedFunctionCall() )
  {
    return visitScopedFunctionCall( scopedFunctionCall );
  }
  else if ( auto identifier = ctx->IDENTIFIER() )
  {
    return make_identifier( identifier );
  }
  else if ( auto functionReference = ctx->functionReference() )
  {
    return visitFunctionReference( functionReference );
  }
  else if ( auto explicitArrayInitializer = ctx->explicitArrayInitializer() )
  {
    return visitExplicitArrayInitializer( explicitArrayInitializer );
  }
  else if ( auto explicitStructInitializer = ctx->explicitStructInitializer() )
  {
    return visitExplicitStructInitializer( explicitStructInitializer );
  }
  else if ( auto explicitDictInitializer = ctx->explicitDictInitializer() )
  {
    return visitExplicitDictInitializer( explicitDictInitializer );
  }
  else if ( auto explicitErrorInitializer = ctx->explicitErrorInitializer() )
  {
    return visitExplicitErrorInitializer( explicitErrorInitializer );
  }
  else if ( auto bareArrayInitializer = ctx->bareArrayInitializer() )
  {
    return visitBareArrayInitializer( bareArrayInitializer );
  }
  else if ( auto interpolatedString = ctx->interpolatedString() )
  {
    return visitInterpolatedString( interpolatedString );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitProgramDeclaration(
    EscriptGrammar::EscriptParser::ProgramDeclarationContext* ctx )
{
  return new_node( ctx, "program-declaration",                                        //
                   "name", make_identifier( ctx->IDENTIFIER() ),                      //
                   "parameters", visitProgramParameters( ctx->programParameters() ),  //
                   "body", visitBlock( ctx->block() )                                 //
  );
}

antlrcpp::Any JsonAstBuilder::visitProgramParameter(
    EscriptGrammar::EscriptParser::ProgramParameterContext* ctx )
{
  antlrcpp::Any init;
  bool unused = ctx->UNUSED();
  if ( auto expression = ctx->expression() )
  {
    init = visitExpression( expression );
  }
  return new_node( ctx, "program-parameter",                      //
                   "name", make_identifier( ctx->IDENTIFIER() ),  //
                   "unused", unused,                              //
                   "init", init                                   //
  );
}

antlrcpp::Any JsonAstBuilder::visitStatement( EscriptGrammar::EscriptParser::StatementContext* ctx )
{
  if ( auto ifStatement = ctx->ifStatement() )
  {
    return visitIfStatement( ifStatement );
  }
  else if ( auto gotoStatement = ctx->gotoStatement() )
  {
    return visitGotoStatement( gotoStatement );
  }
  else if ( auto returnStatement = ctx->returnStatement() )
  {
    return visitReturnStatement( returnStatement );
  }
  else if ( auto constStatement = ctx->constStatement() )
  {
    return visitConstStatement( constStatement );
  }
  else if ( auto varStatement = ctx->varStatement() )
  {
    return visitVarStatement( varStatement );
  }
  else if ( auto doStatement = ctx->doStatement() )
  {
    return visitDoStatement( doStatement );
  }
  else if ( auto whileStatement = ctx->whileStatement() )
  {
    return visitWhileStatement( whileStatement );
  }
  else if ( auto exitStatement = ctx->exitStatement() )
  {
    return visitExitStatement( exitStatement );
  }
  else if ( auto breakStatement = ctx->breakStatement() )
  {
    return visitBreakStatement( breakStatement );
  }
  else if ( auto continueStatement = ctx->continueStatement() )
  {
    return visitContinueStatement( continueStatement );
  }
  else if ( auto forStatement = ctx->forStatement() )
  {
    return visitForStatement( forStatement );
  }
  else if ( auto foreachStatement = ctx->foreachStatement() )
  {
    return visitForeachStatement( foreachStatement );
  }
  else if ( auto repeatStatement = ctx->repeatStatement() )
  {
    return visitRepeatStatement( repeatStatement );
  }
  else if ( auto caseStatement = ctx->caseStatement() )
  {
    return visitCaseStatement( caseStatement );
  }
  else if ( auto enumStatement = ctx->enumStatement() )
  {
    return visitEnumStatement( enumStatement );
  }
  else if ( auto expression = ctx->statementExpression )
  {
    return new_node( ctx, "expression-statement",                 //
                     "expression", visitExpression( expression )  //
    );
  }

  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitStringIdentifier(
    EscriptGrammar::EscriptParser::StringIdentifierContext* ctx )
{
  if ( auto identifier = ctx->IDENTIFIER() )
  {
    return make_identifier( identifier );
  }
  else if ( auto string_literal = ctx->STRING_LITERAL() )
  {
    return make_string_literal( string_literal );
  }
  return antlrcpp::Any();
}

antlrcpp::Any JsonAstBuilder::visitStructInitializerExpression(
    EscriptGrammar::EscriptParser::StructInitializerExpressionContext* ctx )
{
  antlrcpp::Any name;
  antlrcpp::Any init;

  if ( auto identifier = ctx->IDENTIFIER() )
  {
    name = make_identifier( identifier );
  }
  else if ( auto string_literal = ctx->STRING_LITERAL() )
  {
    name = make_string_literal( string_literal );
  }

  if ( auto expression = ctx->expression() )
  {
    init = visitExpression( expression );
  }
  return new_node( ctx, "struct-initializer",  //
                   "name", name,               //
                   "init", init                //
  );
}

antlrcpp::Any JsonAstBuilder::visitUseDeclaration(
    EscriptGrammar::EscriptParser::UseDeclarationContext* ctx )
{
  return new_node( ctx, "use-declaration",                                        //
                   "specifier", visitStringIdentifier( ctx->stringIdentifier() )  //
  );
}

antlrcpp::Any JsonAstBuilder::make_statement_label(
    EscriptGrammar::EscriptParser::StatementLabelContext* ctx )
{
  antlrcpp::Any label;

  if ( ctx )
  {
    label = make_identifier( ctx->IDENTIFIER() );
  }

  return label;
}

antlrcpp::Any JsonAstBuilder::make_identifier( antlr4::tree::TerminalNode* terminal )
{
  return new_node( terminal, "identifier",    //
                   "id", terminal->getText()  //
  );
}

antlrcpp::Any JsonAstBuilder::make_string_literal( antlr4::tree::TerminalNode* terminal,
                                                   const std::string& text )
{
  return new_node( terminal, "string-value",  //
                   "value", text,             //
                   "raw", text                //
  );
}

antlrcpp::Any JsonAstBuilder::make_string_literal( antlr4::tree::TerminalNode* terminal )
{
  auto text = terminal->getText();

  return new_node( terminal, "string-literal",                    //
                   "value", text.substr( 1, text.length() - 2 ),  //
                   "raw", text                                    //
  );
}

antlrcpp::Any JsonAstBuilder::make_integer_literal( antlr4::tree::TerminalNode* terminal )
{
  auto text = terminal->getText();

  return new_node( terminal, "integer-literal",  //
                   "value", std::stoi( text ),   //
                   "raw", text                   //
  );
}

antlrcpp::Any JsonAstBuilder::make_float_literal( antlr4::tree::TerminalNode* terminal )
{
  auto text = terminal->getText();

  return new_node( terminal, "float-literal",   //
                   "value", std::stod( text ),  //
                   "raw", text                  //
  );
}

antlrcpp::Any JsonAstBuilder::make_bool_literal( antlr4::tree::TerminalNode* terminal )
{
  auto text = terminal->getText();
  bool value = terminal->getSymbol()->getType() == EscriptGrammar::EscriptLexer::BOOL_TRUE;

  return new_node( terminal, "boolean-literal",  //
                   "value", value,               //
                   "raw", text                   //
  );
}

}  // namespace VSCodeEscript::CompilerExt
