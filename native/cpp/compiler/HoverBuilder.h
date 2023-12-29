#ifndef VSCODEESCRIPT_HOVERBUILDER_H
#define VSCODEESCRIPT_HOVERBUILDER_H

#include "SemanticContextBuilder.h"

namespace Pol::Bscript::Compiler
{
class ModuleFunctionDeclaration;
class SourceLocation;
class Node;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript
{
class LSPWorkspace;
}

namespace VSCodeEscript::CompilerExt
{

struct HoverResult
{
  enum class SymbolType : int
  {
    VARIABLE,
    CONSTANT,
    MODULE_FUNCTION,
    MODULE_FUNCTION_PARAMETER,
    USER_FUNCTION,
    USER_FUNCTION_PARAMETER,
    PROGRAM,
    PROGRAM_PARAMETER,
    MEMBER,
    METHOD
  } type;

  std::string symbol;
  std::string hover;
  Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def = nullptr;
};

class HoverBuilder : public SemanticContextBuilder<HoverResult>
{
public:
  HoverBuilder( VSCodeEscript::LSPWorkspace*, Pol::Bscript::Compiler::CompilerWorkspace&,
                const Pol::Bscript::Compiler::Position& position );

  ~HoverBuilder() override = default;

  virtual std::optional<HoverResult> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;
  virtual std::optional<HoverResult> get_constant(
      Pol::Bscript::Compiler::ConstDeclaration* const_decl ) override;

  virtual std::optional<HoverResult> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* ) override;
  virtual std::optional<HoverResult> get_module_function_parameter(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<HoverResult> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;
  virtual std::optional<HoverResult> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<HoverResult> get_program(
      const std::string& name, Pol::Bscript::Compiler::Program* program ) override;
  virtual std::optional<HoverResult> get_program_parameter( const std::string& param ) override;
  virtual std::optional<HoverResult> get_member( const std::string& name ) override;
  virtual std::optional<HoverResult> get_method( const std::string& name ) override;

private:
  HoverResult& append_comment( Pol::Bscript::Compiler::Node* node, HoverResult& result );
  HoverResult& append_comment( const Pol::Bscript::Compiler::SourceLocation& loc,
                               HoverResult& result );

  VSCodeEscript::LSPWorkspace* _lsp_workspace;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_HOVERBUILDER_H
