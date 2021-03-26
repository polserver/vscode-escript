import { createConnection, TextDocuments, TextDocumentChangeEvent, ProposedFeatures, InitializeParams, TextDocumentSyncKind, InitializeResult, SemanticTokensParams, SemanticTokensBuilder, SemanticTokens, ClientCapabilities } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Workspace } from '../workspace/workspace';
import { validateTextDocument } from '../semantics/analyzer';
import { URI } from 'vscode-uri';
import { promises } from 'fs';
import access = promises.access;
import { join } from 'path';
import { F_OK } from 'constants';

// vsce does not support symlinks
// import { escript } from 'vscode-escript-native';
const { native } = require('../../../native/out/index') as typeof import('vscode-escript-native');
const { LSPWorkspace } = native;

export class LSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private workspace: typeof LSPWorkspace;

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
        this.documents.listen(this.connection);
        this.workspace = new LSPWorkspace({
            getContents: (pathname) => {
                const uri = URI.file(pathname).toString();
                const text = this.documents.get(uri)?.getText();
                if (typeof text !== 'undefined') {
                    return text;
                }
                throw new Error(`Could not get text for ${uri}`);
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
        this.workspace.open(fsPath);
    };

    private onDidClose = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);

        // Clear diagnostics
        this.connection.sendDiagnostics({
            uri,
            diagnostics: []
        });
        this.workspace.close(fsPath);
    };

    private onDidChangeContent = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);
        try {
            this.workspace.analyze(fsPath);
            const diagnostics = this.workspace.diagnostics(fsPath);

            this.connection.sendDiagnostics({
                uri,
                diagnostics
            });
        } catch (ex) {
            console.error(ex);
        }
    };

    private onSemanticTokens = async (params: SemanticTokensParams): Promise<SemanticTokens> => {
        const builder = new SemanticTokensBuilder();
        const { fsPath } = URI.parse(params.textDocument.uri);
        const tokens = this.workspace.tokens(fsPath);

        for (const token of tokens) {
            builder.push(...token);
        }

        return builder.build();
    };
}
