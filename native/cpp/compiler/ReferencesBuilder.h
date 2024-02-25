#pragma once

#include "bscript/compiler/ast/NodeVisitor.h"

#include <string>

namespace Pol::Bscript::Compiler
{
class CompilerWorkspace;
}

namespace VSCodeEscript
{
class LSPWorkspace;
}

namespace VSCodeEscript::CompilerExt
{

class ReferencesBuilder : public Pol::Bscript::Compiler::NodeVisitor
{
public:
  ReferencesBuilder( LSPWorkspace* lsp_workspace, Pol::Bscript::Compiler::CompilerWorkspace&,
                     const std::string& pathname );

  void visit_identifier( Pol::Bscript::Compiler::Identifier& ) override;
  void visit_function_call( Pol::Bscript::Compiler::FunctionCall& ) override;

  void visit_float_value( Pol::Bscript::Compiler::FloatValue& ) override;
  void visit_integer_value( Pol::Bscript::Compiler::IntegerValue& ) override;
  void visit_string_value( Pol::Bscript::Compiler::StringValue& ) override;
  void visit_uninitialized_value( Pol::Bscript::Compiler::UninitializedValue& ) override;

  void visit_children( Pol::Bscript::Compiler::Node& node ) override;

private:
  LSPWorkspace* lsp_workspace;
  Pol::Bscript::Compiler::CompilerWorkspace& compiler_workspace;
  const std::string& pathname;

  void add_unoptimized_constant_reference( const Pol::Bscript::Compiler::Node& );
};
}  // namespace VSCodeEscript::CompilerExt