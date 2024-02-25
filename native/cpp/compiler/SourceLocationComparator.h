#pragma once

#include "bscript/compiler/file/SourceLocation.h"

namespace VSCodeEscript::CompilerExt
{
struct ReferenceLocation
{
  std::string pathname;
  Pol::Bscript::Compiler::Range range;
};

class ReferenceLocationComparator
{
public:
  bool operator()( const ReferenceLocation& x1, const ReferenceLocation& x2 ) const;
};
class RangeComparator
{
public:
  bool operator()( const Pol::Bscript::Compiler::Range& x1,
                   const Pol::Bscript::Compiler::Range& x2 ) const;
};
}  // namespace VSCodeEscript::CompilerExt
