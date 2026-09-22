#ifndef VSCODEESCRIPT_TOKENLENGTH_H
#define VSCODEESCRIPT_TOKENLENGTH_H

#include <antlr4-runtime.h>
#include <cstddef>

namespace VSCodeEscript::CompilerExt
{
/**
 * Length of a token in characters, without materializing its text.
 *
 * The position tests in the builders only ever needed `getText().length()`, but
 * `CommonToken::getText()` copies a substring out of the input stream, so asking
 * for a length allocated a `std::string` per token examined. Those tests run
 * across every token in the file on hover, completion and signature help.
 *
 * Deliberately only two virtual calls. An earlier version also fetched the
 * input stream and its size to decide whether the indices were usable, and
 * benchmarked no faster than `getText()`: a token short enough for the
 * string's small-buffer optimisation never reaches the heap, so the allocation
 * this was meant to avoid mostly was not happening, while the extra virtual
 * dispatch was.
 *
 * For any token spanning real input the text is the inclusive interval
 * `[start, stop]`. A zero-width token -- EOF above all -- carries
 * `stop == start - 1`, which would wrap on the unsigned subtraction, so those
 * fall through to `getText()` and match its "<EOF>" exactly.
 */
inline std::size_t token_length( const antlr4::Token* token )
{
  if ( !token )
    return 0;

  auto start = token->getStartIndex();
  auto stop = token->getStopIndex();

  if ( stop >= start )
    return stop - start + 1;

  return token->getText().length();
}

}  // namespace VSCodeEscript::CompilerExt

#endif  // VSCODEESCRIPT_TOKENLENGTH_H
