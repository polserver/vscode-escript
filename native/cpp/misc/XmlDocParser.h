#pragma once

#include <memory>
#include <string>
#include <vector>

namespace VSCodeEscript::CompilerExt
{
struct XmlDocFunctionParameter
{
  std::string name;
  std::string value;
};

class XmlDocParser
{
public:
  std::string prototype;
  std::vector<XmlDocFunctionParameter> parameters;
  std::string explain;
  std::string returns;
  std::vector<std::string> errors;

  // TODO cache?
  static std::unique_ptr<XmlDocParser> parse_function( const std::string& filename,
                                                       const std::string& functionName );
};
}  // namespace VSCodeEscript::CompilerExt
