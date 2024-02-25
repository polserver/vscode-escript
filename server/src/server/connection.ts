import { createConnection, TextDocuments, TextDocumentChangeEvent, ProposedFeatures, InitializeParams, TextDocumentSyncKind, InitializeResult, SemanticTokensParams, SemanticTokensBuilder, SemanticTokens, Hover, HoverParams, MarkupContent, DefinitionParams, Location, CompletionParams, CompletionItem, SignatureHelpParams, SignatureHelp, ReferenceParams, DocumentDiagnosticParams, DocumentDiagnosticReport, DocumentDiagnosticReportKind, DocumentUri, FullDocumentDiagnosticReport } from 'vscode-languageserver/node';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { readFileSync } from 'fs';
import { access, mkdir } from 'fs/promises';
import { join } from 'path';
import { F_OK } from 'constants';
import DocsDownloader from '../workspace/DocsDownloader';

// vsce does not support symlinks
// import { escript } from 'vscode-escript-native';
const { native } = require('../../../native/out/index') as typeof import('vscode-escript-native');
import type { ExtensionConfiguration } from 'vscode-escript-native';
import { deepEquals } from '../misc/Utils';
const { LSPWorkspace, LSPDocument, ExtensionConfiguration } = native;

type LSPServerOptions = {
    storageFsPath: string;
}

export interface DidChangeConfigurationParams {
    configuration: ExtensionConfiguration
}

export interface InitializationOptions {
    configuration: ExtensionConfiguration
}

export class LSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private workspace: typeof LSPWorkspace;
    public static options: Readonly<LSPServerOptions>;
    private sources: Map<string, typeof LSPDocument> = new Map();
    private downloader: DocsDownloader;
    private configuration: ExtensionConfiguration | undefined;
    private openTabs = new Array<string>();

    public hasDiagnosticRelatedInformationCapability: boolean = false;


    public constructor(options: LSPServerOptions) {
        LSPServer.options = Object.freeze({ ...options });

        console.log('Creating LSPServer with options', options);

        this.connection.onInitialize(this.onInitialize);
        this.documents.onDidOpen(this.onDidOpen);
        this.documents.onDidChangeContent(this.onDidChangeContent);
        this.documents.onDidClose(this.onDidClose);
        this.connection.languages.semanticTokens.on(this.onSemanticTokens);
        this.connection.onHover(this.onHover);
        this.connection.onDefinition(this.onDefinition);
        this.connection.onCompletion(this.onCompletion);
        this.connection.onSignatureHelp(this.onSignatureHelp);
        this.connection.onNotification('didChangeConfiguration', this.onDidChangeConfiguration);
        this.connection.onReferences(this.onReferences);
        this.connection.languages.diagnostics.on(this.onDocumentDiagnostics);

        this.documents.listen(this.connection);
        this.downloader = new DocsDownloader(LSPServer.options.storageFsPath);
        this.workspace = new LSPWorkspace({
            getContents: (pathname) => {
                const uri = URI.file(pathname).toString();
                const text = this.documents.get(uri)?.getText();
                if (typeof text !== 'undefined') {
                    return text;
                }
                return readFileSync(pathname, 'utf-8');
            },
            getXmlDocPath: this.downloader.getXmlDocPath.bind(this.downloader)
        });
    }

    public listen() {
        this.connection.listen();
    }

    private onInitialize = async (params: InitializeParams): Promise<InitializeResult> => {

        console.log('Got initialization params', params.capabilities);
        const workspaceFolders = params.workspaceFolders ?? [];
        const initializationOptions: InitializationOptions = params.initializationOptions;

        try {
            await mkdir(LSPServer.options.storageFsPath, { recursive: true });
        } catch (ex) {
            console.error(`Could not create storage directory '${LSPServer.options.storageFsPath}': ${ex} `);
        }

        let found = false;
        for (const { uri } of workspaceFolders) {
            const { fsPath } = URI.parse(uri);
            const polCfg = join(fsPath, 'pol.cfg');
            const ecompileCfg = join(fsPath, 'scripts', 'ecompile.cfg');

            try {
                await access(polCfg, F_OK);
                await access(ecompileCfg, F_OK);
                this.workspace.open(fsPath);
                console.log(`Successfully read ${ecompileCfg}. Loading cache...`);

                found = true;
            } catch (e) {
                console.error(`Error reading ${ecompileCfg}`, e);
            }
        }

        if (found) {
            this.onDidChangeConfiguration(initializationOptions);
        } else {
            console.log(`Could not find pol.cfg;scripts/ecompile.cfg in [${workspaceFolders.map(x => x.uri).join(', ')}]`);
        }

        try {
            ExtensionConfiguration.setFromObject(initializationOptions?.configuration ?? {});
        } catch (e) {
            console.error('Error setting native configuration:', e);
        }

        this.hasDiagnosticRelatedInformationCapability = Boolean(params.capabilities.textDocument?.publishDiagnostics?.relatedInformation);

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                diagnosticProvider: {
                    interFileDependencies: true,
                    workspaceDiagnostics: false
                },
                hoverProvider: true,
                definitionProvider: true,
                completionProvider: {
                    triggerCharacters: []
                },
                referencesProvider: {
                    workDoneProgress: true
                    // partialResultToken: true
                },
                signatureHelpProvider: {
                    triggerCharacters: ['(', ',']
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

        if (found) {
            // Must do next tick because `window/workDoneProgress/create` will not be registered yet.
            process.nextTick(async () => {
                const serverInitiatedReporter = await this.connection.window.createWorkDoneProgress();
                serverInitiatedReporter.begin('Workspace Cache');
                this.workspace.updateCache(({ count, total }) => {
                    serverInitiatedReporter.report(100 * count / total, `Reading files ${count}/${total}`);
                }).then(() => {
                    serverInitiatedReporter.done();
                    console.log(`Cache loaded.`);
                });
            });
        }

        return result;
    };

    private onDidOpen = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { fsPath } = URI.parse(e.document.uri);
        this.sources.set(fsPath, this.workspace.getDocument(fsPath));
    };

    private onDidClose = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);

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
            document.analyze(this.configuration?.continueAnalysisOnError);
        } catch (ex) {
            console.error(ex);
        }
    };

    private onDocumentDiagnostics = async (e: DocumentDiagnosticParams): Promise<DocumentDiagnosticReport> => {
        const { uri } = e.textDocument;
        const { fsPath } = URI.parse(uri);

        const document = this.sources.get(fsPath) ?? this.workspace.getDocument(fsPath);
        this.sources.set(fsPath, document);
        const diagnostics = document.diagnostics();

        const relatedDocuments: {[uri: DocumentUri]: FullDocumentDiagnosticReport} = {};

        for (const [dependeePathname, dependeeDoc] of this.sources.entries()) {
            if (dependeePathname !== fsPath && dependeeDoc.dependents().includes(fsPath)) {
                const uri = URI.file(dependeePathname).toString();
                dependeeDoc.analyze();
                const diagnostics = dependeeDoc.diagnostics();
                relatedDocuments[uri] = {
                    kind: DocumentDiagnosticReportKind.Full,
                    items: diagnostics
                };
            }
        }
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: diagnostics,
            relatedDocuments
        };
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
                const contents: MarkupContent = {
                    value: hover,
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

    private onSignatureHelp = async (params: SignatureHelpParams): Promise<SignatureHelp | null> => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        return document?.signatureHelp(position) ?? null;
    };

    private onDidChangeConfiguration = (params: DidChangeConfigurationParams): void => {
        if (deepEquals(this.configuration, params.configuration)) {
            return;
        }

        console.log('ExtensionConfiguration changed:', params);
        this.configuration = params.configuration;

        try {
            ExtensionConfiguration.setFromObject(params.configuration ?? {});
        } catch (e) {
            console.error('Error setting native configuration:', e);
        }

        if (this.downloader.commitId === '' || params.configuration.polCommitId !== this.downloader.commitId) {
            this.downloader.start(this.workspace.workspaceRoot, this.workspace.getConfigValue('ModuleDirectory'), params.configuration.polCommitId).catch(e => {
                console.warn(`Could not download polserver documentation: ${e?.message ?? e}`);
            });
        }
    };

    private onReferences = async (params: ReferenceParams): Promise<Location[] | null | undefined> => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };

        const serverInitiatedReporter = await this.connection.window.createWorkDoneProgress();

        serverInitiatedReporter.begin('References', undefined, undefined, true);

        const controller = new AbortController();
        serverInitiatedReporter.token.onCancellationRequested(() => {
            controller.abort();
        });

        const loaded = await this.workspace.updateCache(({ count, total }) => {
            serverInitiatedReporter.report(100 * count / total, `Waiting for workspace cache...`);
        }, controller.signal);

        serverInitiatedReporter.done();

        if (!loaded) {
            return undefined;
        }

        const document = this.sources.get(fsPath);
        if (document) {
            const references = document.references(position);
            if (references) {
                if (params.context.includeDeclaration) {
                    const definition = document.definition(position, { nameOnly: true });
                    if (definition) {
                        references.unshift(definition);
                    }
                }
                return references.map(x => ({ ...x, uri: URI.file(x.fsPath).toString() }));
            }
        }
        return null;
    };
}
