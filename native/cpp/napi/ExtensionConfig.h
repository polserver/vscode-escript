#pragma once

#include <map>
#include <napi.h>
#include <vector>

namespace VSCodeEscript
{
class ExtensionConfiguration
{
public:
  ExtensionConfiguration();

  static Napi::Value SetFromObject( const Napi::CallbackInfo& info );

  std::string polCommitId;
  bool showModuleFunctionComments;
};

extern ExtensionConfiguration gExtensionConfiguration;
}  // namespace VSCodeEscript
