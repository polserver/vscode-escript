import { AbstractParseTreeVisitor } from 'antlr4ts/tree';
import { ANTLRInputStream, CommonTokenStream, ProxyParserErrorListener } from 'antlr4ts';
import { EscriptLexer, EscriptParser, EscriptParserVisitor, CaseChangingStream } from 'escript-antlr4';
import { timeSync } from '../util';
import { SourceFile, SourceFileType } from '../workspace/source-file';

type Result = any;

type ParserError = { uri: string, line: number, character: number, msg: string };

export class AST {
    public readonly parseTree: any;
    public readonly syntaxTree: any;
    public readonly parserErrors: ParserError[] = [];
    public readonly stats: {
        parse: number | undefined;
        syntax: number | undefined;
    } = { parse: undefined, syntax: undefined };

    public constructor(source: SourceFile) {
        const uri = source.document.uri;

        const parseFunction =
            source.type === SourceFileType.SRC || source.type === SourceFileType.INC ? 1 :
                source.type === SourceFileType.EM ? 2 : undefined;

        if (parseFunction !== undefined) {
            try {
                const { parserErrors } = this;
                const chars = new ANTLRInputStream(source.document.getText());
                const lexer = new EscriptLexer(new CaseChangingStream(uri, chars, false));

                const tokens = new CommonTokenStream(lexer);
                const parser = new EscriptParser(tokens);

                const errorListener = new ProxyParserErrorListener([{
                    syntaxError(recognizer, offendingSymbol, line: number, column: number, msg: string, e) {
                        if (recognizer instanceof EscriptParser) {
                            parserErrors.push({ uri, line: line - 1, character: column, msg });
                        }
                    }
                }]);

                lexer.removeErrorListeners();
                lexer.addErrorListener(errorListener as any);
                parser.removeErrorListeners();
                parser.addErrorListener(errorListener);

                const { val: parseTree, time: parseTime } = timeSync(() => parseFunction === 1 ? parser.compilationUnit() : parser.moduleUnit());
                this.parseTree = parseTree;
                this.stats.parse = parseTime;

                const visitor = new EscriptParserVisitorImpl();

                const { val: syntaxTree, time: syntaxTime } = timeSync(() => visitor.visit(parseTree));
                this.syntaxTree = syntaxTree;
                this.stats.syntax = syntaxTime;
            } catch (e) {
                console.error(`Error generating AST on ${uri}`, e);
            }
        }
    }
}

export default class EscriptParserVisitorImpl extends AbstractParseTreeVisitor<Result> implements EscriptParserVisitor<Result> {
    protected aggregateResult(aggregate: Result, nextResult: Result): Result {
        return aggregate + nextResult;
        // When all nodes have a visit implementation, aggregation will never occur.
        // throw new Error('Aggregation should not occur here');

    }
    protected defaultResult() {
        return 1;
        // When all nodes have a visit implementation, there will never be a default result.
        // throw new Error('defaultResult should not occur here');
    }
}
