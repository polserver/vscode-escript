import { createConnection, TextDocuments, TextDocumentChangeEvent, ProposedFeatures, InitializeParams, TextDocumentSyncKind, InitializeResult, SemanticTokensParams, SemanticTokensBuilder, SemanticTokens, Hover, HoverParams, MarkupContent, DefinitionParams, Location, CompletionParams, CompletionItem } from 'vscode-languageserver/node';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { promises, readFileSync } from 'fs';
import access = promises.access;
import { join } from 'path';
import { F_OK } from 'constants';

// vsce does not support symlinks
// import { escript } from 'vscode-escript-native';
const { native } = require('../../../native/out/index') as typeof import('vscode-escript-native');
const { LSPWorkspace, LSPDocument } = native;

export class LSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private workspace: typeof LSPWorkspace;
    private sources: Map<string, typeof LSPDocument> = new Map();

    public hasDiagnosticRelatedInformationCapability: boolean = false;

    private static _instance: LSPServer | undefined;
    public static get instance(): LSPServer {
        return LSPServer._instance ?? (LSPServer._instance = new LSPServer());
    }

    private constructor() {
        this.connection.onInitialize(this.onInitialize);
        this.documents.onDidOpen(this.onDidOpen);
        this.documents.onDidChangeContent(this.onDidChangeContent);
        this.documents.onDidClose(this.onDidClose);
        this.connection.languages.semanticTokens.on(this.onSemanticTokens);
        this.connection.onHover(this.onHover);
        this.connection.onDefinition(this.onDefinition);
        this.connection.onCompletion(this.onCompletion);
        this.documents.listen(this.connection);
        this.workspace = new LSPWorkspace({
            getContents: (pathname) => {
                const uri = URI.file(pathname).toString();
                const text = this.documents.get(uri)?.getText();
                if (typeof text !== 'undefined') {
                    return text;
                }
                return readFileSync(pathname, 'utf-8');
            }
        });
    }

    public listen() {
        this.connection.listen();
    }

    private onInitialize = async (params: InitializeParams): Promise<InitializeResult> => {

        const workspaceFolders = params.workspaceFolders ?? [];
        let found = false;
        for (const { uri } of workspaceFolders) {
            const { fsPath } = URI.parse(uri);
            const polCfg = join(fsPath, 'pol.cfg');
            const ecompileCfg = join(fsPath, 'scripts', 'ecompile.cfg');

            try {
                await access(polCfg, F_OK);
                await access(ecompileCfg, F_OK);
                this.workspace.read(ecompileCfg);
                console.log(`Successfully read ${ecompileCfg}`);
                found = true;
            } catch (e) {
                console.error(`Error reading ${ecompileCfg}`, e);
            }
        }

        if (!found) {
            console.log(`Could not find pol.cfg;scripts/ecompile.cfg in [${workspaceFolders.map(x => x.uri).join(', ')}]`);
        }

        this.hasDiagnosticRelatedInformationCapability = Boolean(params.capabilities.textDocument?.publishDiagnostics?.relatedInformation);

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                hoverProvider: true,
                definitionProvider: true,
                completionProvider: {
                    triggerCharacters: []
                },
                semanticTokensProvider: {
                    // FIXME: Should come from blib
                    legend: {
                        tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'],
                        tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary']
                    },
                    range: false,
                    full: true
                }
            }
        };
        return result;
    }

    private onDidOpen = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { fsPath } = URI.parse(e.document.uri);
        this.sources.set(fsPath, new LSPDocument(this.workspace, fsPath));
    };

    private onDidClose = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);

        // Clear diagnostics
        this.connection.sendDiagnostics({
            uri,
            diagnostics: []
        });
        this.sources.delete(fsPath);
    };

    private onDidChangeContent = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);
        const document = this.sources.get(fsPath);
        try {
            if (!document) {
                throw new Error('Document not opened');
            }
            document.analyze();
            const diagnostics = document.diagnostics();

            this.connection.sendDiagnostics({
                uri,
                diagnostics
            });

            for (const [ dependeePathname, dependeeDoc ] of this.sources.entries()) {
                if (dependeePathname !== fsPath && dependeeDoc.dependents().includes(fsPath)) {
                    const uri = URI.file(dependeePathname).toString();
                    dependeeDoc.analyze();
                    const diagnostics = dependeeDoc.diagnostics();
                    this.connection.sendDiagnostics({
                        uri,
                        diagnostics
                    });
                }
            }
        } catch (ex) {
            console.error(ex);
        }
    };

    private onSemanticTokens = async (params: SemanticTokensParams): Promise<SemanticTokens> => {
        const builder = new SemanticTokensBuilder();
        const { fsPath } = URI.parse(params.textDocument.uri);
        const document = this.sources.get(fsPath);
        try {
            if (!document) {
                throw new Error('Document not opened');
            }
            const tokens = document.tokens();

            const sorted = tokens.sort((tokInfo1, tokInfo2) => {
                const line = tokInfo1[0] - tokInfo2[0];
                if (line === 0) {
                    return tokInfo1[1] - tokInfo2[1];
                }
                return line;
            });

            for (const token of sorted) {
                builder.push(...token);
            }
        } catch (ex) {
            console.error(ex);
        }
        return builder.build();
    };

    private onHover = (params: HoverParams): Hover | null => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        if (document) {
            const hover = document.hover(position);
            if (hover) {
                const value = '```\n' + hover + '\n```';
                const contents: MarkupContent = {
                    value,
                    kind: 'markdown'
                };

                return {
                    contents
                };
            }
        }
        return null;
    };

    private onDefinition = async (params: DefinitionParams): Promise<Location | null> => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        if (document) {
            const definition = document.definition(position);
            if (definition) {
                return {
                    range: definition.range,
                    uri: URI.file(definition.fsPath).toString()
                };
            }
        }
        return null;
    };

    private onCompletion = async (params: CompletionParams): Promise<CompletionItem[] | null> => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        if (document) {
            const completion = document.completion(position);
            if (completion) {
                return completion;
            }
        }
        return null;
    };
}
