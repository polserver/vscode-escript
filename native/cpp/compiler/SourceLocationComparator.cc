#include "SourceLocationComparator.h"

#include "bscript/compiler/file/SourceFileIdentifier.h"
#include "clib/clib.h"

using namespace Pol::Bscript::Compiler;

namespace VSCodeEscript::CompilerExt
{
bool ReferenceLocationComparator::operator()( const ReferenceLocation& x1,
                                              const ReferenceLocation& x2 ) const
{
  if ( x1.range.start.line_number != x2.range.start.line_number )
  {
    return x1.range.start.line_number < x2.range.start.line_number;
  }
  if ( x1.range.start.character_column != x2.range.start.character_column )
  {
    return x1.range.start.character_column < x2.range.start.character_column;
  }
  if ( x1.range.start.token_index != x2.range.start.token_index )
  {
    return x1.range.start.token_index < x2.range.start.token_index;
  }

  if ( x1.range.end.line_number != x2.range.end.line_number )
  {
    return x1.range.end.line_number < x2.range.end.line_number;
  }
  if ( x1.range.end.character_column != x2.range.end.character_column )
  {
    return x1.range.end.character_column < x2.range.end.character_column;
  }
  if ( x1.range.end.token_index != x2.range.end.token_index )
  {
    return x1.range.end.token_index < x2.range.end.token_index;
  }

  // Compare source file identifiers
  auto compare = stricmp( x1.pathname.c_str(), x2.pathname.c_str() );

  if ( compare != 0 )
  {
    return compare < 0;
  }

  return false;
}

bool RangeComparator::operator()( const Range& x1, const Range& x2 ) const
{
  if ( x1.start.line_number != x2.start.line_number )
  {
    return x1.start.line_number < x2.start.line_number;
  }
  if ( x1.start.character_column != x2.start.character_column )
  {
    return x1.start.character_column < x2.start.character_column;
  }
  if ( x1.start.token_index != x2.start.token_index )
  {
    return x1.start.token_index < x2.start.token_index;
  }

  if ( x1.end.line_number != x2.end.line_number )
  {
    return x1.end.line_number < x2.end.line_number;
  }
  if ( x1.end.character_column != x2.end.character_column )
  {
    return x1.end.character_column < x2.end.character_column;
  }
  if ( x1.end.token_index != x2.end.token_index )
  {
    return x1.end.token_index < x2.end.token_index;
  }

  return false;
}

}  // namespace VSCodeEscript::CompilerExt