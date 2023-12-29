#include "XmlDocParser.h"

#include <clib/strutil.h>
#include <memory>
#include <tinyxml/tinyxml.h>

namespace VSCodeEscript::CompilerExt
{
std::string get_node_string( TiXmlNode* node )
{
  std::string result;

  for ( node = node->FirstChild(); node != nullptr; node = node->NextSibling() )
  {
    if ( node->Type() == TiXmlNode::TINYXML_TEXT )
    {
      result += std::string( result.empty() ? "" : "\n" ) + node->ValueStr();
    }
    else if ( node->Type() == TiXmlNode::TINYXML_ELEMENT && node->ValueStr() == "code" )
    {
      auto* codeText = node->FirstChild();

      if ( codeText != nullptr && codeText->Type() == TiXmlNode::TINYXML_TEXT )
      {
        result += std::string( result.empty() ? "" : "\n" ) + "```\n" +
                  Pol::Clib::strtrim( codeText->ValueStr() ) + "\n```";
      }
    }
  }
  return result;
}

std::unique_ptr<XmlDocParser> XmlDocParser::parse_function( const std::string& filename,
                                                            const std::string& functionName )
{
  TiXmlDocument file;
  file.SetCondenseWhiteSpace( false );
  if ( !file.LoadFile( filename ) )
    return {};


  auto* node = file.FirstChild( "ESCRIPT" );
  if ( !node )
    return {};

  auto parsed = std::make_unique<XmlDocParser>();

  for ( TiXmlElement* functionNode = node->FirstChildElement( "function" ); functionNode != nullptr;
        functionNode = functionNode->NextSiblingElement( "function" ) )
  {
    auto* functName = functionNode->Attribute( "name" );

    if ( functName == functionName )
    {
      for ( auto* child = functionNode->FirstChildElement(); child != nullptr;
            child = child->NextSiblingElement() )
      {
        if ( child->ValueStr() == "explain" )
        {
          parsed->explain += get_node_string( child );
        }
        else if ( child->ValueStr() == "return" )
        {
          parsed->returns = get_node_string( child );
        }
        else if ( child->ValueStr() == "error" )
        {
          parsed->errors.push_back( get_node_string( child ) );
        }
        else if ( child->ValueStr() == "parameter" )
        {
          auto* paramName = child->Attribute( "name" );
          auto* paramValue = child->Attribute( "value" );
          if ( paramValue != nullptr && paramValue != nullptr )
          {
            parsed->parameters.push_back( XmlDocFunctionParameter{ paramName, paramValue } );
          }
        }
      }
    }
  }

  return parsed;
}
}  // namespace VSCodeEscript::CompilerExt
