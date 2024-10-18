#include "DefinitionBuilder.h"

#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "bscript/compilercfg.h"
#include "clib/fileutil.h"
#include "plib/pkg.h"

using namespace Pol::Bscript::Compiler;
using namespace EscriptGrammar;
using namespace Pol;

namespace VSCodeEscript::CompilerExt
{
DefinitionBuilder::DefinitionBuilder( CompilerWorkspace& workspace, const Position& position )
    : SemanticContextBuilder( workspace, position )
{
}

std::optional<SourceLocation> DefinitionBuilder::get_constant( ConstDeclaration* const_decl )
{
  return const_decl->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_variable( std::shared_ptr<Variable> variable )
{
  return variable->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_module_function(
    ModuleFunctionDeclaration* function_def )
{
  return function_def->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_user_function( UserFunction* function_def )
{
  return function_def->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_module_function_parameter(
    ModuleFunctionDeclaration* function_def, FunctionParameterDeclaration* param )
{
  return param->source_location;
}


std::optional<SourceLocation> DefinitionBuilder::get_user_function_parameter(
    UserFunction* function_def, FunctionParameterDeclaration* param )
{
  return param->source_location;
}

std::optional<SourceLocation> DefinitionBuilder::get_program( const std::string& name,
                                                              Program* program )
{
  return program->source_location;
}

std::optional<Pol::Bscript::Compiler::SourceLocation> DefinitionBuilder::get_program_parameter(
    const std::string& name )
{
  if ( auto& program = workspace.program )
  {
    for ( auto& child : program->parameter_list().children )
    {
      auto& program_parameter = static_cast<ProgramParameterDeclaration&>( *child );
      if ( program_parameter.name == name )
      {
        return program_parameter.source_location;
      }
    }
  }
  return {};
}

std::string getpathof( const std::string& fname )
{
  std::string::size_type pos = fname.find_last_of( "\\/" );
  if ( pos == std::string::npos )
    return "./";
  else
    return fname.substr( 0, pos + 1 );
}

std::optional<SourceLocation> DefinitionBuilder::get_include( const std::string& include_name )
{
  std::string filename_part = include_name + ".inc";


  std::string current_file_path =
      getpathof( workspace.referenced_source_file_identifiers[0]->pathname );
  std::string filename_full = current_file_path + filename_part;

  if ( filename_part[0] == ':' )
  {
    const Plib::Package* pkg = nullptr;
    std::string path;
    if ( Plib::pkgdef_split( filename_part, nullptr, &pkg, &path ) )
    {
      if ( pkg != nullptr )
      {
        filename_full = pkg->dir() + path;
        std::string try_filename_full = pkg->dir() + "include/" + path;

        if ( !Clib::FileExists( filename_full.c_str() ) )
        {
          if ( Clib::FileExists( try_filename_full.c_str() ) )
          {
            filename_full = try_filename_full;
          }
        }
      }
      else
      {
        filename_full = Pol::Bscript::compilercfg.PolScriptRoot + path;
      }
    }
    else
    {
      return {};
    }
  }
  else
  {
    if ( !Clib::FileExists( filename_full.c_str() ) )
    {
      std::string try_filename_full = Bscript::compilercfg.IncludeDirectory + filename_part;
      if ( Clib::FileExists( try_filename_full.c_str() ) )
      {
        filename_full = try_filename_full;
      }
    }
  }

  filename_full = Clib::FullPath( filename_full.c_str() );

  if ( !filename_full.empty() )
  {
    auto itr = std::find_if( workspace.referenced_source_file_identifiers.begin(),
                             workspace.referenced_source_file_identifiers.end(),
                             [&]( const std::unique_ptr<SourceFileIdentifier>& ident )
                             { return ident->pathname.compare( filename_full ) == 0; } );
    if ( itr != workspace.referenced_source_file_identifiers.end() )
    {
      return SourceLocation( itr->get(), Range( Position{ 1, 1, 0 }, Position{ 1, 1, 0 } ) );
    }
  }

  return {};
}

std::optional<SourceLocation> DefinitionBuilder::get_module( const std::string& module_name )
{
  std::string pathname = Pol::Clib::FullPath(
      fmt::format( "{}{}.em", Pol::Bscript::compilercfg.ModuleDirectory, module_name ).c_str() );

  auto itr = std::find_if( workspace.referenced_source_file_identifiers.begin(),
                           workspace.referenced_source_file_identifiers.end(),
                           [&]( const std::unique_ptr<SourceFileIdentifier>& ident )
                           { return ident->pathname.compare( pathname ) == 0; } );
  if ( itr != workspace.referenced_source_file_identifiers.end() )
  {
    return SourceLocation( itr->get(), Range( Position{ 1, 1, 0 }, Position{ 1, 1, 0 } ) );
  }
  return {};
}

std::optional<Pol::Bscript::Compiler::SourceLocation> DefinitionBuilder::get_class(
    const std::string& name )
{
  auto itr = workspace.all_class_locations.find( name );
  if ( itr != workspace.all_class_locations.end() )
  {
    return itr->second;
  }
  return {};
}

}  // namespace VSCodeEscript::CompilerExt