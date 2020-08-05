/* tslint:disable */
import * as antlr4ts from 'antlr4ts';
import { promises as fsp } from 'fs';
import CaseChangingStream from './case-changer';
import { Range, TextDocument, SymbolInformation, DocumentSymbol, Position, DefinitionLink, CompletionItem, SignatureHelp, PublishDiagnosticsParams, Diagnostic, DiagnosticSeverity, Hover, Proposed, CancellationToken, FileChangeType } from 'vscode-languageserver';
import { SemanticTokensBuilder, SemanticTokens } from 'vscode-languageserver/lib/semanticTokens.proposed';
import { EscriptLexer } from 'escript-antlr4';
import EscriptParserVisitorImpl, { SemanticError } from './grammars/EscriptParserVisitorImpl';
import { Scope, SymbolMapType, Sym, SymType, ExportedProperty, MemberProperty, MethodProperty } from './semantics';
import { extname, basename } from 'path';
import { Token, ParserRuleContext } from 'antlr4ts';
import { fileURLToPath } from 'url';
import { findMatchingParen, containsPosition } from './utils';
import { EscriptWorkspacePathDetails } from './workspace';
import ASTVisitor, { ImportResolver, TokenTypes, TokenTypeIds, ASTVisitResult } from './grammars/ast-visitor';
import { toJSON, Program } from './grammars/ast-types';
import { Node } from './grammars/ast-types';
import { EscriptParserImpl, ModuleUnitContext, CompilationUnitContext } from './grammars/EscriptParserImpl';
type SemanticTokenResult = Parameters<typeof SemanticTokensBuilder.prototype.push>;


// const time = async<T>(label: string, cb: () => Promise<T> | T) => {
//     const start = Date.now();
//     const val = await cb();
//     const end = Date.now();
//     return { time: end - start, val };
// };

// function time<T>(label: string, cb: () => T): {time: number, val: T};
// function time<T extends PromiseLike<T>>(label: string, cb: () => Promise<T>): Promise<{time: number, val: 3}>;

function timeSync<T>(label: string, cb: () => T): {time: number, val: T}  {
    const start = Date.now();
    const val = cb();
    return { time: Date.now() - start, val };
}

function time<T>(label: string, cb: () => Promise<T>): Promise<{time: number, val: T}> {
    const start = Date.now();
    const val = cb();
    return val.then(val => ({ time: Date.now() - start, val }));
}



function getLexicalTokenResult(token: antlr4ts.Token): Array<SemanticTokenResult> {
    const result: Array<SemanticTokenResult> = [];
    let type: TokenTypes | null = null;

    switch (token.type) {
    case EscriptLexer.COMMENT:
    case EscriptLexer.LINE_COMMENT:
        type = TokenTypes.COMMENT;
        break;

    case EscriptLexer.STRING_LITERAL:
        type = TokenTypes.STRING;
        break;

    case EscriptLexer.IF:
    case EscriptLexer.THEN:
    case EscriptLexer.ELSEIF:
    case EscriptLexer.ENDIF:
    case EscriptLexer.ELSE:
    case EscriptLexer.GOTO:
    case EscriptLexer.RETURN:
    case EscriptLexer.TOK_CONST:
    case EscriptLexer.VAR:
    case EscriptLexer.DO:
    case EscriptLexer.DOWHILE:
    case EscriptLexer.WHILE:
    case EscriptLexer.ENDWHILE:
    case EscriptLexer.EXIT:
    case EscriptLexer.DECLARE:
    case EscriptLexer.REPEAT:
    case EscriptLexer.UNTIL:
    case EscriptLexer.CASE:
    case EscriptLexer.DEFAULT:
    case EscriptLexer.ENDCASE:
    case EscriptLexer.ENUM:
    case EscriptLexer.ENDENUM:
    case EscriptLexer.BREAK:
    case EscriptLexer.CONTINUE:
    case EscriptLexer.FOR:
    case EscriptLexer.ENDFOR:
    case EscriptLexer.TO:
    case EscriptLexer.FOREACH:
    case EscriptLexer.ENDFOREACH:
    case EscriptLexer.DOWNTO:
    case EscriptLexer.STEP:
    case EscriptLexer.AS:
    case EscriptLexer.USE:
    case EscriptLexer.INCLUDE:
    case EscriptLexer.FUNCTION:
    case EscriptLexer.ENDFUNCTION:
    case EscriptLexer.PROGRAM:
    case EscriptLexer.ENDPROGRAM:

        type = TokenTypes.KEYWORD;
        break;

    case EscriptLexer.DECIMAL_LITERAL:
    case EscriptLexer.HEX_LITERAL:
    case EscriptLexer.OCT_LITERAL:
    case EscriptLexer.BINARY_LITERAL:
    case EscriptLexer.FLOAT_LITERAL:
    case EscriptLexer.HEX_FLOAT_LITERAL:
        type = TokenTypes.NUMBER;
        break;

    case EscriptLexer.TOK_IN:
    case EscriptLexer.LPAREN:
    case EscriptLexer.RPAREN:
    case EscriptLexer.LBRACK:
    case EscriptLexer.RBRACK:
    case EscriptLexer.LBRACE:
    case EscriptLexer.RBRACE:
    case EscriptLexer.DOT:
    case EscriptLexer.ARROW:
    case EscriptLexer.MUL:
    case EscriptLexer.DIV:
    case EscriptLexer.MOD:
    case EscriptLexer.ADD:
    case EscriptLexer.SUB:
    case EscriptLexer.ADD_ASSIGN:
    case EscriptLexer.SUB_ASSIGN:
    case EscriptLexer.MUL_ASSIGN:
    case EscriptLexer.DIV_ASSIGN:
    case EscriptLexer.MOD_ASSIGN:
    case EscriptLexer.LE:
    case EscriptLexer.LT:
    case EscriptLexer.GE:
    case EscriptLexer.GT:
    case EscriptLexer.RSHIFT:
    case EscriptLexer.LSHIFT:
    case EscriptLexer.BITAND:
    case EscriptLexer.CARET:
    case EscriptLexer.BITOR:
    case EscriptLexer.NOTEQUAL_A:
    case EscriptLexer.NOTEQUAL_B:
    case EscriptLexer.EQUAL:
    case EscriptLexer.ASSIGN:
    case EscriptLexer.ADDMEMBER:
    case EscriptLexer.DELMEMBER:
    case EscriptLexer.CHKMEMBER:
    case EscriptLexer.SEMI:
    case EscriptLexer.COMMA:
    case EscriptLexer.TILDE:
    case EscriptLexer.AT:
    case EscriptLexer.COLONCOLON:
    case EscriptLexer.COLON:
    case EscriptLexer.INC:
    case EscriptLexer.DEC:
    case EscriptLexer.IS:
    case EscriptLexer.AND_A:
    case EscriptLexer.AND_B:
    case EscriptLexer.OR_A:
    case EscriptLexer.OR_B:
    case EscriptLexer.BANG_A:
    case EscriptLexer.BANG_B:
        type = TokenTypes.OPERATOR;
        break;

    case EscriptLexer.HASH:
    case EscriptLexer.TOK_ERROR:
    case EscriptLexer.DICTIONARY:
    case EscriptLexer.STRUCT:
    case EscriptLexer.ARRAY:
    case EscriptLexer.STACK:
        type = TokenTypes.TYPE;
        break;

    case EscriptLexer.IDENTIFIER:

        // const text = token.text;

        // if (scope && text) {
        //     const resolved = scope.resolve(text);
        //     if (resolved) {
        //         // @TODO handle labels...
        //         switch (resolved.getType()) {
        //         case SymType.NAMESPACE:
        //             type = TokenTypes.NAMESPACE;
        //             break;
        //         case SymType.FUNCTION:
        //         case SymType.MODULE_FUNCTION:
        //         case SymType.PROGRAM:
        //             type = TokenTypes.FUNCTION;
        //             break;
        //         }
        //     }
        // }
        // if (!type) {
        //     type = TokenTypes.VARIABLE;
        // }
        break;
    case EscriptLexer.EXPORTED:
    case EscriptLexer.REFERENCE:
    case EscriptLexer.TOK_OUT:
    case EscriptLexer.INOUT:
    case EscriptLexer.BYVAL:
    case EscriptLexer.TOK_LONG:
    case EscriptLexer.INTEGER:
    case EscriptLexer.UNSIGNED:
    case EscriptLexer.SIGNED:
    case EscriptLexer.REAL:
    case EscriptLexer.FLOAT:
    case EscriptLexer.DOUBLE:
    case EscriptLexer.BYREF:
    case EscriptLexer.UNUSED:
    case EscriptLexer.WS:
    case EscriptLexer.EOF:
        type = null;
        break;
    }

    if ((type === TokenTypes.STRING || type === TokenTypes.COMMENT) && token.text) {
        return token.text.split(/[\r\n]/).map((line, index, lines) => [
            token.line - 1 + index,
            index > 0 ? 0 : token.charPositionInLine,
            index < lines.length ? line.length : token.stopIndex - token.startIndex + 1,
            TokenTypeIds[type!],
            0
        ]);
    } else if (type !== null) {
        return [
            [token.line - 1, token.charPositionInLine, token.stopIndex - token.startIndex + 1, TokenTypeIds[type], 0]
        ];
    }
    return [];
}

export type CancellationRequested = { reason: 'cancel' }
export type ReparseRequested = { reason: 'reparse' }
export type RecursivelyRequested = { reason: 'recursive' }
export type PushSourceError = { reason: 'error', details: string };

type PushSourceSuccess = {
    reason: 'success',
    source: TextDocument;
    // depUris: Set<string>;
    tokens: antlr4ts.Token[];
    // error: string;
    tree: ModuleUnitContext | CompilationUnitContext;
    visit: Program;
    astVisit: ASTVisitResult;
};

export type PushSourceResult = PushSourceSuccess | PushSourceError | CancellationRequested | RecursivelyRequested | ReparseRequested;


export const CancellationRequested: CancellationRequested = { reason: 'cancel' } as const;
export const RecursivelyRequested: RecursivelyRequested = { reason: 'recursive' } as const;
export const ReparseRequested: ReparseRequested = { reason: 'reparse' } as const;

type EscriptSymbolBuilderOptions = {
    ctoken?: CancellationToken;
    exportsOnly?: boolean;
    cache?: boolean;
}

type SourceResultsCache = {
    [srcUri: string]: {
        [depUri: string]: PushSourceSuccess
    }
}

export class TextDocumentCache {
    static cache: { [uri: string]: { opened: boolean, document: TextDocument } } = {};

    static async find(uri: string) {
        if (this.cache[uri]) {
            return this.cache[uri];
        }
        const input = await fsp.readFile(fileURLToPath(uri), 'utf-8');
        const document = TextDocument.create(uri, 'escript', 0, input);
        return this.cache[uri] = { opened: false, document };
    }

    static invalidate(uri: string, change: FileChangeType) {
        const ext = extname(uri).toLowerCase();
        if ((ext === '.src' || ext === '.inc' || ext === '.em')) {
            if (!this.cache[uri]?.opened) {
                EscriptSymbolBuilder.invalidate(uri, {close:true});
            }
        } else if (ext === '.cfg') {
            EscriptWorkspacePathDetails.reprocess(uri, change);
        }
    }

    static put(document: TextDocument) {
        this.cache[document.uri] = { opened: true, document };
        EscriptSymbolBuilder.invalidate(document.uri, { close: false });
    }

    static close(document: TextDocument) {
        EscriptSymbolBuilder.invalidate(document.uri, { close: true });
        delete this.cache[document.uri];
    }
}

type ParserError = { uri: string, line: number, character: number, msg: string };
export class EscriptSymbolBuilder {
    workspace: EscriptWorkspacePathDetails | null;

    static nextId = 0;
    

    private id = ++EscriptSymbolBuilder.nextId;
    private results?: PushSourceSuccess;
    private parserErrors: ParserError[] = [];
    private ctokens: CancellationToken[] = [];
    private invalid?: 'close' | 'reparse';
    public readonly exportsOnly: boolean;

    static sourceResults: SourceResultsCache = {};
    public static map: Map<string, EscriptSymbolBuilder | { builder: EscriptSymbolBuilder, pending: ReturnType<typeof EscriptSymbolBuilder['create']>}> = new Map();

    private constructor(private uri: string, opts?: EscriptSymbolBuilderOptions) {
        EscriptSymbolBuilder.sourceResults[this.uri] = EscriptSymbolBuilder.sourceResults[this.uri] ?? {};
        if (opts?.ctoken) {
            this.ctokens.push(opts.ctoken);
        }
        this.exportsOnly = opts?.exportsOnly ?? false;
        this.initSync();
    }

    static create(uri: string, opts?: EscriptSymbolBuilderOptions): Promise<EscriptSymbolBuilder | CancellationRequested | PushSourceError>;
    static create(document: TextDocument, opts?: EscriptSymbolBuilderOptions): Promise<EscriptSymbolBuilder | CancellationRequested | PushSourceError>;

    static async create(arg0: string | TextDocument, opts?: EscriptSymbolBuilderOptions): Promise<EscriptSymbolBuilder | CancellationRequested | PushSourceError> {
        const uri = typeof arg0 === 'string' ? arg0 : arg0.uri;
        let old = this.map.get(uri);

        if (old) {
            const builder = 'builder' in old ? old.builder : old;
            if (builder.exportsOnly && !opts?.exportsOnly) {
                this.map.delete(uri);
                old = undefined;
            }
        }

        if (!old) {
            const builder = new EscriptSymbolBuilder(uri, opts);
            builder.log('Create new builder');
            const pending = new Promise<EscriptSymbolBuilder | CancellationRequested | PushSourceError>((resolve, reject) => {
                // new Promise(resolve => setTimeout(resolve, 60000)).then(() => 
                (typeof arg0 === 'string' ? TextDocumentCache.find(arg0) : Promise.resolve({opened: false, document: arg0})).then(({document}) => {
                    builder.init().then(() => {
                        builder.pushSource(document).then((results) => {
                            // new Promise(resolve => setTimeout(resolve, 5000)).then(() => 
                            builder.log(`pushSource result: ${results.reason}${'details' in results ? ' ' + results.details : ''}`);
                            if (results.reason === 'success') {
                                builder.results = results;
                                for (const cached in EscriptSymbolBuilder.sourceResults[uri]) {
                                    if (!builder.results.astVisit.depUris.has(cached)) {
                                        builder.log(`Deleting unused compilation of ${cached}`);
                                        delete EscriptSymbolBuilder.sourceResults[uri][cached];
                                    }
                                }
                                if (opts?.cache ?? true) {
                                    this.map.set(uri, builder);
                                } else {
                                    builder.invalidate(true);
                                }
                                resolve(builder);
                            } else if (results.reason === 'reparse') {
                                resolve(EscriptSymbolBuilder.create(uri, opts));
                            } else if (results.reason === 'error' || results.reason === 'cancel') {
                                resolve(results);
                            } else {
                                resolve({ 'reason': 'error', 'details': 'Unknown error' });
                            }
                        }).catch(reject);
                    }).catch(reject);
                }).catch(reject); // () => { /** @TODO proper error handler */});
                // );
            });
            if (opts?.cache ?? true) {
                this.map.set(uri, { builder, pending });
            }
            return pending;
        } else {
            if ('builder' in old) {
                if (opts?.ctoken) {
                    old.builder.ctokens.push(opts.ctoken);
                }
                old.builder.log(`Use existing builder`);
                return old.pending;
            }
            old.log(`Use existing builder`);
            return old;
        }
    }

    static invalidate(uri: string, { close } = { close: true }) {
        const existing = this.map.get(uri);
        if (existing) {
            if ('pending' in existing) {
                existing.builder.invalidate(close);
            } else {
                existing.invalidate(close);
            }
        }

        // console.log(`Invalidating cache for ${uri}`);
        // for (const builderUri in this.sourceResults) {
        //     const results = this.sourceResults[builderUri];
        //     for (const depUri in results) {
        //         if (results[depUri].astVisit.depUris.has(uri)) {
        //             console.log('Deleting dependent entry for', depUri, 'from', builderUri);
        //             delete this.sourceResults[builderUri][depUri];
        //         }
        //     }
        // }
        // delete this.sourceResults[uri]?.[uri];
        // this.map.delete(uri);
    }

    private get logId() {
        return `[ESB-${this.id.toString(16).padStart(4, '0')}-${(this.getUri(false))}]`;
    }

    public log(...args: any[]) {
        console.log.apply(console, ([this.logId]).concat(...args) as [any?, ...any[]] );
    }
    public error(...args: any[]) {
        console.error.apply(console, ([this.logId]).concat(...args) as [any?, ...any[]] );
    }

    private initSync() {
        const workspace = this.workspace = this.workspace || EscriptWorkspacePathDetails.findSync(this.uri, { types: true, builder: this });
        return Boolean(workspace);

    }

    private async init() {
        const workspace = this.workspace = this.workspace || await EscriptWorkspacePathDetails.find(this.uri, { types: true, builder: this });
        return Boolean(workspace);
    }

    private async resolveModule(module: string, currentDeps: Set<string>): Promise<PushSourceResult> {
        if (!this.workspace) {
            return { reason: 'error', details: 'Workspace is not initialized.' };
        }
        const sourceUri = await this.workspace.locateModule(module);
        if (!sourceUri) {
            return { reason: 'error', details: `Could not locate module '${module}'` };
        }

        const skip = currentDeps === undefined ? false : currentDeps.has(sourceUri);
        this.log('Pushing module', sourceUri, 'skip =', skip);
        return this.importDependency(sourceUri, currentDeps);
    }


    private async resolveInclude(includeSpec: string, currentDeps: Set<string>): Promise<PushSourceResult> {
        if (!this.workspace) {
            return { reason: 'error', details: 'Workspace is not initialized.' };
        }
        const sourceUri = await this.workspace.locateInclude(includeSpec);
        if (sourceUri === this.uri || !sourceUri) {
            return { reason: 'error', details: `Could not locate include file '${includeSpec}'` };
        }
        const skip = currentDeps === undefined ? false : currentDeps.has(sourceUri);

        this.log('Pushing include', sourceUri, 'skip = ', skip);
        return this.importDependency(sourceUri, currentDeps);

    }
    private async importDependency(uri: string, currentDeps: Set<string>): Promise<PushSourceResult> {
        try {
            const { document } = await TextDocumentCache.find(uri);
            return this.pushSource(document, currentDeps);
        } catch (e) {
            return {
                reason: 'error',
                details: `Could not push dependent ${uri}: ${e?.message ?? e.toString()}`
            };
        }
    }


    public async importResolver(currentDeps: Set<string>, importKind: 'module' | 'include', what: string): ReturnType<ImportResolver> {

        return (importKind === 'include' ? this.resolveInclude(what, currentDeps) : this.resolveModule(what, currentDeps));

        // if (typeof imported === 'string') {
        //     return new Error(imported);
        // } else if (!imported) {
        //     return undefined;  // cyclic dependency
        // } else {
        //     return imported.astVisit; // { scope, diagnostics, depUris:  };
        // }
        // if ('astVisit' in imported) {
        //     return imported.astVisit;
        // } else if (imported.reason === 'recursive') {
        //     return undefined;
        // } else {
        //     imported.reason;
        // }
    }

    async pushSource(source: TextDocument, currentDeps: Set<string> = new Set()): Promise<PushSourceResult> {
        const { uri } = source;
        const { uri: rootUri } = this;

        if (this.ctokens.some(x => x.isCancellationRequested) || this.invalid === 'close') {
            return CancellationRequested;
        } else if (this.invalid === 'reparse') {
            return ReparseRequested;
        } else if (currentDeps.has(uri)) {
            return RecursivelyRequested;
        }

        const cachedResult = EscriptSymbolBuilder.sourceResults[this.uri]?.[uri];
        if (cachedResult) {
            this.log('Returning cached results for', uri);
            return cachedResult;
        }
        currentDeps = new Set(currentDeps);
        currentDeps.add(uri);

        const filename = new URL(source.uri).pathname;
        const input = source.getText();
        const parserErrors = this.parserErrors;

        try {
            let parseMode: number;
            const ext = extname(uri).toLowerCase();
            switch (ext) {
            case '.src':
            case '.inc':
                parseMode = 1;
                break;
            case '.em':
                parseMode = 2;
                break;
            default: throw new Error(`Invalid extension for ${uri}; expecting .src, .inc, .em`);
            }
            const chars = new antlr4ts.ANTLRInputStream(input);
            const lexer = new EscriptLexer(new CaseChangingStream(filename, chars, false));

            const tokens = new antlr4ts.CommonTokenStream(lexer);
            const parser = new EscriptParserImpl(tokens, uri);

            const errorListener = new antlr4ts.ProxyParserErrorListener([{
                syntaxError(recognizer, offendingSymbol, line: number, column: number, msg: string, e) {
                    if (recognizer instanceof EscriptParserImpl && recognizer.getUri() === rootUri) {
                        parserErrors.push({ uri, line: line - 1, character: column, msg });
                    }
                }
            }]);
            lexer.removeErrorListeners();
            lexer.addErrorListener(errorListener as any);
            parser.removeErrorListeners();
            parser.addErrorListener(errorListener);

            const firstRule = parser.ruleNames[0];
            if (!firstRule) { throw new Error('Could not get first rule for EscriptParser from prototype'); }

            const { val: tree, time: parseTime } = timeSync('Parse source', () => parseMode === 2 ? parser.moduleUnit() : parser.compilationUnit() );
            this.log(`Parse took ${parseTime}ms`);

            const isRoot = uri === this.uri;
            const visitor = new EscriptParserVisitorImpl(uri, tokens, isRoot && !this.exportsOnly);

            const { val: visits, time: visitSourceTime } = timeSync('Visit source', () => visitor.visit(tree));
            const visit = Array.isArray(visits) ? visits[0] : visits;
            if (visit.type !== 'Program') {
                throw new Error('Root of EscriptVisit is not a Program');
            }

            const astVisitor = new ASTVisitor(uri, currentDeps, {
                importResolver: this.importResolver.bind(this),
                typeResolver: this.workspace?.resolveType.bind(this.workspace)
            });

            const { val: astVisit, time: visitAstTime } = await time('AST Visit', () => astVisitor.visit2(visit, this.exportsOnly ? { exportsOnly: true } : this.uri === uri ? { addStandardDeps: true } : undefined) );

            if (this.ctokens.some(x => x.isCancellationRequested) || this.invalid === 'close') {
                return CancellationRequested;
            } else if (this.invalid === 'reparse' || !astVisit) {
                return ReparseRequested;
            }

            this.log(`AST Visit took ${visitAstTime}ms`);

            const result: PushSourceSuccess = {
                reason: 'success',
                tokens: tokens.getTokens(),
                tree,
                visit,
                source,
                astVisit,
                // depUris: new Set(this.currentDeps)
            };
            EscriptSymbolBuilder.sourceResults[this.uri][uri] = result;
            return result;
        } catch (e) {
            return {
                reason: 'error',
                details: `Could not parse input file: ${e?.message ?? e}\n${parserErrors.slice(0, 5).join('\n')}`
            } as PushSourceError;
        }
    }

    public workspaceUpdated() {

    }

    public invalidate(close: boolean) {
        this.log('Invalidated, close = ',close);
        if (close) {
            delete EscriptSymbolBuilder.sourceResults[this.uri];
        } else {
            for (const result in EscriptSymbolBuilder.sourceResults[this.uri]) {
                if (EscriptSymbolBuilder.sourceResults[this.uri][result].astVisit.depUris.has(this.uri)) {
                    delete EscriptSymbolBuilder.sourceResults[this.uri][result];
                }
            }
        }
        this.invalid = close ? 'close' : 'reparse';
        EscriptSymbolBuilder.map.delete(this.uri);
        delete this.results;
        this.workspace?.invalidate(this, close);
    }

    public getUri(full = true) {
        if (full) {
            return this.uri;
        } else {
            let root = this.workspace?.root;
            return root ? this.uri.replace(root,'') : this.uri;
        }
    }

    getExportedFunctions(): Sym[] | null {
        if (!this.results) { return null; }
        const exports: Sym[] = [];
        this.results.astVisit.scope.symbols.forEach(sym => {
            if (sym.getType() === SymType.EXPORTED_FUNCTION) {
                exports.push(sym);
            }
        });
        return exports;
    }

    getDiagnostics(): PublishDiagnosticsParams {
        let diagnostics: Diagnostic[] = [];

        for (const err of this.parserErrors) {
            let diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: err,
                    end: err
                },
                message: err.msg,
                source: 'escript-parser'
            };
            diagnostics.push(diagnostic);
        }
        if (this.results) {
            diagnostics.push(...this.results.astVisit.diagnostics);
        }
        return { uri: this.uri, diagnostics };
    }

    private tokenBuilder: SemanticTokensBuilder;

    getSemanticTokens(): Proposed.SemanticTokens {
        // const results = new SemanticTokensBuilder();
        if (!this.results) { return new SemanticTokensBuilder().build(); }

        if (!this.tokenBuilder) {
            this.tokenBuilder = new SemanticTokensBuilder();

            const { tokens, astVisit } = this.results;
            this.log('getSemanticTokens');
            const results: SemanticTokenResult[] = [];
            // if (tokenToScope) {
            for (const token of tokens) {
                getLexicalTokenResult(token).forEach(semanticResult => {
                    results.push(semanticResult);
                });
            }
            results.push(...astVisit.tokens);

            const sorted = results.sort((tokInfo1, tokInfo2) => {
                const line = tokInfo1[0] - tokInfo2[0];
                if (!line) { return tokInfo1[1] - tokInfo2[1]; }
                return line;
            });
            sorted.forEach(result => this.tokenBuilder.push(...result));
        }
        return this.tokenBuilder.build();
    }

    getLocalSymbols(): DocumentSymbol[] {
        const results: DocumentSymbol[] = [];
        if (!this.results) { return results; }
        const { astVisit, visit } = this.results;
        this.log('getLocalSymbols');

        Node.visitChildren(visit, (node) => {
            if (node.type === 'Identifier') {
                const sym = astVisit.scope.walkScope(node.range.start, node.name);
                if (sym) {
                    results.push(sym.toDocumentSymbol(node.range));
                }
            }
        });
        return results;
    }

    getExternalSymbols(): SymbolInformation[] {
        const results: SymbolInformation[] = [];
        if (!this.results) { return results; }
        this.log('getExternalSymbols');
        const { astVisit } = this.results;
        const scopes: Scope[] = [astVisit.scope];
        let currentScope: Scope | undefined;

        while ((currentScope = scopes.shift())) {
            if (currentScope.location.uri === this.uri) {
                currentScope.symbols.forEach((sym) => {
                    if (sym.toLocation().uri === this.uri) {
                        results.push(sym.toSymbolInformation());
                    }
                });
                scopes.push(...currentScope.children);
            }
        }
        return results;
    }

    private getTokenAtPosition(position: Position) {
        if (!this.results) { return undefined; }
        const { tokens } = this.results;
        for (let i = tokens.length - 1; i >= 0; --i) {
            const token = tokens[i];
            if (token.line - 1 === position.line && token.charPositionInLine <= position.character) {
                return token;
            } else if (token.line - 1 < position.line) {
                break;
            }
        }
        return undefined;
    }

    getDefinitionAt(position: Position): DefinitionLink | undefined {
        if (!this.results) { return undefined; }
        this.log('getDefinitionAt');
        const { visit, astVisit } = this.results;
        const what = Node.find(visit, position);
        this.log('Looking for definition for', what);
        const nodes: Node[] = [];
        const astNode = Node.find(visit, position, (n) => nodes.push(n));
        const parent = nodes[nodes.length - 2] as Node | undefined;
        const gparent = nodes[nodes.length - 3] as Node | undefined;
        // this.log(`AST Node at ${JSON.stringify(position)} is`, nodes);
        if (astNode) {
            if (astNode.type === 'Identifier') {
                if (parent && parent.type === 'MemberExpression' && containsPosition(parent.property.range, position)) {
                    const scopes: Scope[] = [];
                    astVisit.scope.walkScope(parent.object.range.start, undefined, SymbolMapType.SYMBOLS, (scope) => scopes.push(scope));
                    const { annoType } = parent.object;
                    const prop = Scope.findTypeProperties(scopes, annoType, astNode.name, this.workspace);
                    this.log('prop is', prop);
                    let type: ExportedProperty | MemberProperty | MethodProperty | undefined = undefined;
                    // const type = prop.methods[0] ?? prop.members[0];
                    if (gparent?.type === 'MemberCallExpression') {
                        if (prop.methods.length === 1) {
                            type = prop.methods[0];
                        } else {
                            for (const method of prop.methods) {
                                const argLength = method.type === 'method' ? Object.entries(Sym.getParams(method.anno.tags)).length : method.sym.getArgCount() - 1;
                                if (argLength === gparent.arguments.length) {
                                    type = method;
                                    break;
                                }
                            }
                        }
                    } else {
                        type = prop.members[0];
                    }
                    if (type) {
                        if (type.type === 'exported') {
                            return type.sym.toDefinitionLink();
                        } else {
                            return type.sym?.toDefinitionLink(type);
                        }
                        // const contents = Sym.typeToMarkup(type);
                        // if (contents) {
                        //     return { contents };
                        // }
                    }
                    // if (parentSym) {
                    //     return parentSym.getMemberMarkup(astNode.name, scopes, gparent?.type === 'MemberCallExpression' ? 'methods' : 'members');
                    // }
                }
                else {
                    const sym = astVisit.scope.walkScope(position, astNode.name);
                    this.log('Go-to definition found', sym);
                    if (sym) {
                        return sym.toDefinitionLink();
                    }
                }
            }
        }
        return undefined;
    }

    astToJSON(): object | null {
        if (!this.results) { return null; }
        return toJSON(this.results.visit);
    }

    getHover(position: Position): Hover | null {
        if (!this.results) { return null; }
        const { astVisit, visit } = this.results;
        this.log('getHover');
        const nodes: Node[] = [];
        const astNode = Node.find(visit, position, (n) => nodes.push(n));
        const parent = nodes[nodes.length - 2] as Node | undefined;
        const gparent = nodes[nodes.length - 3] as Node | undefined;
        // this.log(`AST Node at ${JSON.stringify(position)} is`, nodes);
        if (astNode) {
            if (astNode.type === 'Identifier') {
                if (parent && parent.type === 'MemberExpression' && containsPosition(parent.property.range, position)) {
                    const scopes: Scope[] = [];
                    astVisit.scope.walkScope(parent.object.range.start, undefined, SymbolMapType.SYMBOLS, (scope) => scopes.push(scope));
                    const { annoType } = parent.object;
                    const prop = Scope.findTypeProperties(scopes, annoType, astNode.name, this.workspace);
                    this.log('prop is', prop);
                    let type: ExportedProperty | MemberProperty | MethodProperty | undefined = undefined;
                    // const type = prop.methods[0] ?? prop.members[0];
                    if (gparent?.type === 'MemberCallExpression') {
                        if (prop.methods.length === 1) {
                            type = prop.methods[0];
                        } else {
                            for (const method of prop.methods) {
                                const argLength = method.type === 'method' ? Object.entries(Sym.getParams(method.anno.tags)).length : method.sym.getArgCount() - 1;
                                if (argLength === gparent.arguments.length) {
                                    type = method;
                                    break;
                                }
                            }
                        }
                    } else {
                        type = prop.members[0];
                    }
                    if (type) {
                        const contents = Sym.typeToMarkup(type);
                        if (contents) {
                            return { contents };
                        }
                    }
                    // if (parentSym) {
                    //     return parentSym.getMemberMarkup(astNode.name, scopes, gparent?.type === 'MemberCallExpression' ? 'methods' : 'members');
                    // }
                }
                else {
                    const { time, val: sym } = timeSync('Scope.walkScope', () => astVisit.scope.walkScope(position, astNode.name));

                    this.log(`symbol walk took ${time}ms, is`, sym?.getCasedName());
                    if (sym) {
                        return { contents: sym.toMarkup() };
                    }
                }
            }
        }
        return null;
    }

    getCompletionItems(position: Position): CompletionItem[] {
        const results: CompletionItem[] = [];
        if (!this.results) { return results; }
        const { astVisit, visit } = this.results;
        const token = this.getTokenAtPosition({ line: position.line, character: position.character - 1 });
        if (!token || !token.text) { return results; }
        this.log('getCompletionItems');

        const prefix = token.text.toLowerCase();
        const nodes: Node[] = [];
        Node.find(visit, position, (n) => nodes.push(n));
        const current = nodes[nodes.length - 1] as Node | undefined;
        const parent = nodes[nodes.length - 2] as Node | undefined;

        let astNode = current?.type === 'InvalidExpression' ? parent : current;
        if (astNode?.type === 'MemberCallExpression') {
            astNode = astNode.callee;
        }
        if (astNode && (astNode.type === 'MemberExpression' || (astNode.type === 'Identifier' && parent?.type === 'MemberExpression' && (astNode = parent)))) {
            const prefix = token.text === '.' ? '' : token.text;
            const scopes: Scope[] = [];
            astVisit.scope.walkScope(astNode.range.start, undefined, SymbolMapType.SYMBOLS, (scope) => scopes.push(scope));
            const { annoType } = astNode.object;

            const props = Scope.findTypeProperties(scopes, annoType, prefix, this.workspace);
            this.log('props', props);
            return Sym.getCompletionItems(props);
        }
        else {
            const cb = (scope: Scope) => {
                for (const [name, sym] of scope.symbols) {
                    if (name.startsWith(prefix)) {
                        results.push(sym.toCompletionItem());
                    }
                }
            };
            astVisit.scope.walkScope(position, undefined, SymbolMapType.SYMBOLS, cb);
        }
        return results;
    }

    getSignatureHelp(position: Position): SignatureHelp | null {
        if (!this.results) { return null; }
        this.log('getSignatureHelp');
        const { source, astVisit, visit } = this.results;
        const text = source.getText();
        const matches = findMatchingParen(source, position);
        if (matches) {
            let i = matches.open - 1;
            while (i >= 1 && text[i - 1].match(/\w/)) { i--; }
            const methodCall = text.substring(i, matches.open);
            this.log('maybe prefix is', methodCall);

            const nodes: Node[] = [];
            let astNode = Node.find(visit, position, (n) => nodes.push(n));
            let parent: Node | undefined;

            if (astNode?.type === 'InvalidExpression') {
                astNode = nodes[nodes.length - 2];
            }

            if (astNode && astNode.type === 'MemberCallExpression' && (parent = astNode.callee.object) && parent.type === 'Identifier') {
                const scopes: Scope[] = [];
                astVisit.scope.walkScope(parent.range.start, parent.name, SymbolMapType.SYMBOLS, (scope) => scopes.push(scope));
                const { annoType } = astNode.callee;

                const props = Scope.findTypeProperties(scopes, annoType, methodCall, this.workspace);
                this.log('props', props);
                return Scope.toSignatureHelp(methodCall, props.methods, matches.arg);
            } else {
                const funcSym = astVisit.scope.walkScope(position, methodCall);
                if (funcSym) {
                    return funcSym.toSignatureHelp(matches.arg);
                }
            }
        }
        return null;
    }
}

(globalThis as any).EscriptSymbolBuilder = EscriptSymbolBuilder;

