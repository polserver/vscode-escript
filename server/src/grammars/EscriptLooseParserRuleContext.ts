import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { TerminalNode } from 'antlr4ts/tree';
import { EscriptLexer } from 'escript-antlr4';
import { Token } from 'antlr4ts';

export class EscriptLooseParserRuleContext extends ParserRuleContext {
    // getToken(ttype: number, i: number): TerminalNode {
	// 	try {
	// 		return super.getToken(ttype, i);
	// 	} catch (e) { 
	// 		if (ttype === EscriptLexer.IDENTIFIER) {
	// 			// const x:Token = {
	// 			// 	channel: EscriptLexer.DEFAULT_TOKEN_CHANNEL,
	// 			// 	charPositionInLine: null,
	// 			// 	inputStream: null,
	// 			// 	line: null,
	// 			// 	startIndex: -1,
	// 			// 	stopIndex: -1,
	// 			// 	text: undefined,
	// 			// 	tokenIndex: -1,
	// 			// 	tokenSource: undefined,
	// 			// 	type: Token.INVALID_TYPE,
	// 			// };
	// 			// return new TerminalNode(x);
	// 		}
	// 		throw e;
	// 	}	
	// }
}
