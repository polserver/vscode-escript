import { CommonTokenStream } from 'antlr4ts';


import { EscriptLooseParserRuleContext } from './EscriptLooseParserRuleContext';

const glob: typeof globalThis & { EscriptLooseParserRuleContext?: typeof EscriptLooseParserRuleContext } = globalThis;
glob.EscriptLooseParserRuleContext = EscriptLooseParserRuleContext;
import { EscriptLooseParser } from 'escript-antlr4/lib/antlr/EscriptLooseParser';
delete glob.EscriptLooseParserRuleContext;

export class EscriptParserImpl extends EscriptLooseParser {
	constructor(tokens: CommonTokenStream, private uri: string) {
		super(tokens);
	}
	public getUri() {
		return this.uri;
	}
}

export * from 'escript-antlr4/lib/antlr/EscriptLooseParser';