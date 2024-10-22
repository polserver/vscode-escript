#ifndef VSCODEESCRIPT_DEFINITIONBUILDER_H
#define VSCODEESCRIPT_DEFINITIONBUILDER_H

#include "SemanticContextBuilder.h"

namespace VSCodeEscript::CompilerExt
{
class DefinitionBuilder : public SemanticContextBuilder<Pol::Bscript::Compiler::SourceLocation>
{
public:
  DefinitionBuilder( Pol::Bscript::Compiler::CompilerWorkspace&,
                     const Pol::Bscript::Compiler::Position& position );

  ~DefinitionBuilder() override = default;

  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_variable(
      std::shared_ptr<Pol::Bscript::Compiler::Variable> variable ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_constant(
      Pol::Bscript::Compiler::ConstDeclaration* const_decl ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_module_function(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_module_function_parameter(
      Pol::Bscript::Compiler::ModuleFunctionDeclaration* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_user_function(
      Pol::Bscript::Compiler::UserFunction* ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_user_function_parameter(
      Pol::Bscript::Compiler::UserFunction* function_def,
      Pol::Bscript::Compiler::FunctionParameterDeclaration* param ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_program(
      const std::string& name, Pol::Bscript::Compiler::Program* program ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_program_parameter(
      const std::string& name ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_include(
      const std::string& include_name ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_module(
      const std::string& module_name ) override;
  virtual std::optional<Pol::Bscript::Compiler::SourceLocation> get_class(
      const std::string& name ) override;
};

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_DEFINITIONBUILDER_H
