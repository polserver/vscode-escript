#include "ExtensionConfig.h"
#include "napi.h"

namespace VSCodeEscript
{
ExtensionConfiguration gExtensionConfiguration;

ExtensionConfiguration::ExtensionConfiguration()
    : polCommitId( "" ), showModuleFunctionComments( false )
{
}

Napi::Value ExtensionConfiguration::SetFromObject( const Napi::CallbackInfo& info )
{
  Napi::Env env = info.Env();

  if ( info.Length() < 1 || !info[0].IsObject() )
  {
    Napi::TypeError::New( env, Napi::String::New( env, "Invalid arguments" ) )
        .ThrowAsJavaScriptException();
    return Napi::Value();
  }

  auto config = info[0].As<Napi::Object>();

  if ( config.Has( "polCommitId" ) )
  {
    auto value = config.Get( "polCommitId" );
    if ( value.IsString() )
    {
      gExtensionConfiguration.polCommitId = value.As<Napi::String>().Utf8Value();
    }
    else
    {
      gExtensionConfiguration.polCommitId = "";
    }
  }
  else
  {
    gExtensionConfiguration.polCommitId = "";
  }

  if ( config.Has( "showModuleFunctionComments" ) )
  {
    auto value = config.Get( "showModuleFunctionComments" );
    if ( value.IsBoolean() )
    {
      gExtensionConfiguration.showModuleFunctionComments = value.As<Napi::Boolean>().Value();
    }
    else
    {
      gExtensionConfiguration.showModuleFunctionComments = false;
    }
  }
  else
  {
    gExtensionConfiguration.showModuleFunctionComments = false;
  }
  return env.Undefined();
}
}  // namespace VSCodeEscript
