#ifndef VSCODEESCRIPT_HOVERBUILDER_H
#define VSCODEESCRIPT_HOVERBUILDER_H

#include "SemanticContextBuilder.h"

namespace Pol::Bscript::Compiler
{
class SourceLocation;
class Node;
}  // namespace Pol::Bscript::Compiler

namespace VSCodeEscript::CompilerExt
{
class HoverBuilder : public SemanticContextBuilder<std::string>
{
public:
  HoverBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                const Pol::Bscript::Compiler::Position& position );

  ~HoverBuilder() override = default;

  virtual std::optional<std::string> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;
  virtual std::optional<std::string> get_constant(
      Pol::Bscript::Compiler::ConstDeclaration* const_decl ) override;

  virtual std::optional<std::string> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* ) override;
  virtual std::optional<std::string> get_module_function_parameter(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<std::string> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;
  virtual std::optional<std::string> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<std::string> get_program(
      const std::string& name, Pol::Bscript::Compiler::Program* program ) override;
  virtual std::optional<std::string> get_program_parameter( const std::string& param ) override;
  virtual std::optional<std::string> get_member( const std::string& name ) override;
  virtual std::optional<std::string> get_method( const std::string& name ) override;

private:
  void append_comment( Pol::Bscript::Compiler::Node* node, std::string& result );
  void append_comment( const Pol::Bscript::Compiler::SourceLocation& loc, std::string& result );
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_HOVERBUILDER_H
