import { CancellationToken, ResponseError, LSPErrorCodes, createConnection, TextDocuments, TextDocumentChangeEvent, ProposedFeatures, InitializeParams, DocumentSymbolParams, TextDocumentSyncKind, InitializeResult, SemanticTokensParams, SemanticTokensBuilder, SemanticTokens, Hover, HoverParams, MarkupContent, DefinitionParams, Location, CompletionParams, CompletionItem, SignatureHelpParams, SignatureHelp, ReferenceParams, DocumentDiagnosticParams, DocumentDiagnosticReport, DocumentDiagnosticReportKind, DocumentUri, FullDocumentDiagnosticReport, DocumentFormattingParams, TextEdit, DocumentRangeFormattingParams, FormattingOptions, Range, DidChangeWatchedFilesParams, FileChangeType, DocumentSymbol } from 'vscode-languageserver/node';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { access, mkdir } from 'fs/promises';
import { join } from 'path';
import { F_OK } from 'constants';
import DocsDownloader from '../workspace/DocsDownloader';

// vsce does not support symlinks
// import { escript } from 'vscode-escript-native';
const { native } = require('../../../native/out/index') as typeof import('vscode-escript-native');
import type { CompilerProfile, ExtensionConfiguration } from 'vscode-escript-native';
import { deepEquals } from '../misc/Utils';
import { beginOperation, endOperation, formatError, type BreadcrumbPosition } from '../misc/Diagnostics';
const { LSPWorkspace, LSPDocument, ExtensionConfiguration } = native;

type LSPServerOptions = {
    storageFsPath: string;
}

/**
 * Files whose parse trees the compiler caches. Editing one of these invalidates
 * the cache; editing a `.src` does not, which is the common case and where the
 * caching actually pays off.
 */
const CACHED_PARSE_TREE_EXTENSIONS = ['.inc', '.em'];

function isCachedParseTreeFile(fsPath: string): boolean {
    const lowered = fsPath.toLowerCase();
    return CACHED_PARSE_TREE_EXTENSIONS.some(extension => lowered.endsWith(extension));
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

    /**
     * Documents whose analysis is out of date. Editing marks; the first request
     * that actually needs the syntax tree pays for it.
     *
     * Analysis used to run eagerly on every change notification, and pull
     * diagnostics then re-ran it, so a single keystroke cost at least two full
     * compiles of the document and of every open file including it.
     */
    private dirty: Set<string> = new Set();

    /**
     * fsPath -> files that document includes, refreshed after each analysis.
     * Cached so that marking dependents dirty stays in JS instead of calling
     * across N-API for every open document on every keystroke.
     */
    private dependsOn: Map<string, string[]> = new Map();
    private downloader: DocsDownloader;
    private configuration: ExtensionConfiguration | undefined;
    private updateCacheAbortController: AbortController | undefined;

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
        this.connection.onDocumentFormatting(this.onDocumentFormatting);
        this.connection.onDocumentRangeFormatting(this.onDocumentRangeFormatting);
        this.connection.onDefinition(this.onDefinition);
        this.connection.onCompletion(this.onCompletion);
        this.connection.onSignatureHelp(this.onSignatureHelp);
        this.connection.onNotification('didChangeConfiguration', this.onDidChangeConfiguration);
        // No client UI drives this: it exists so a scripted LSP client -- which
        // is how this server's performance work gets measured -- can read the
        // counters at an arbitrary point in a session.
        this.connection.onNotification('escript/logProfile', () => this.logProfile('on demand'));
        this.connection.onReferences(this.onReferences);
        this.connection.languages.diagnostics.on(this.onDocumentDiagnostics);
        this.connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles);
        this.connection.onDocumentSymbol(this.onDocumentSymbol);

        this.documents.listen(this.connection);
        this.downloader = new DocsDownloader(LSPServer.options.storageFsPath);
        this.workspace = new LSPWorkspace({
            // Answers only for documents open in an editor, where the buffer
            // may hold unsaved edits the file does not. Everything else --
            // every include pulled in by an analysis, every file of the
            // workspace index build -- is read by the addon directly, which
            // saves an N-API round trip and two string copies per file.
            getContents: (pathname) => this.documents.get(URI.file(pathname).toString())?.getText(),
            getXmlDocPath: this.downloader.getXmlDocPath.bind(this.downloader)
        });
    }

    public listen() {
        this.connection.listen();
    }

    /**
     * Logging goes through the LSP connection so it is timestamped and
     * level-tagged in the client's output channel. The fallback covers the
     * window before the connection is listening.
     */
    private log(message: string): void {
        try {
            this.connection.console.log(message);
        } catch {
            console.log(message);
        }
    }

    private logError(message: string, e?: unknown): void {
        const text = e === undefined ? message : `${message}: ${formatError(e)}`;
        try {
            this.connection.console.error(text);
        } catch {
            console.error(text);
        }
    }

    private logWarn(message: string): void {
        try {
            this.connection.console.warn(message);
        } catch {
            console.warn(message);
        }
    }

    /**
     * Renders the compiler's counters for the output channel.
     *
     * `*Micros` fields are reported as milliseconds, and zero-valued entries are
     * dropped so the line stays readable. The counters are cumulative and are
     * never reset, so anything measuring a single operation has to pass the
     * snapshot it took beforehand as `since`.
     *
     * Two of them lie if read naively: `astSrcMicros` and `astIncMicros` are
     * decremented by nested include time, so they are self-time and can come out
     * negative. `ambiguities` counts SLL parse failures, each of which cost a
     * full re-parse in LL mode.
     */
    private formatProfile(profile: CompilerProfile, since?: CompilerProfile): string {
        const parts = Object.entries(profile)
            .map(([key, value]) => {
                const delta = since ? value - (since[key as keyof CompilerProfile] ?? 0) : value;
                return [key, delta] as const;
            })
            .filter(([, delta]) => delta !== 0)
            .map(([key, delta]) => key.endsWith('Micros')
                ? `${key.slice(0, -'Micros'.length)}=${(delta / 1000).toFixed(1)}ms`
                : `${key}=${delta}`);

        return parts.length ? parts.join(' ') : '(no change)';
    }

    /**
     * Snapshot of the compiler's counters, or `undefined` if the workspace was
     * never opened.
     */
    private profileSnapshot(): CompilerProfile | undefined {
        return this.guard<CompilerProfile | undefined>('workspace/profile', () => this.workspace.profile, undefined);
    }

    private logProfile(label: string, since?: CompilerProfile): void {
        const profile = this.profileSnapshot();
        if (profile) {
            this.log(`Compiler profile [${label}]: ${this.formatProfile(profile, since)}`);
        }
    }

    /**
     * Runs a native call with a crash breadcrumb set, and degrades a failure to
     * `fallback` rather than letting it escape the handler.
     *
     * Every method on `LSPDocument`/`LSPWorkspace` is a synchronous call into the
     * compiler. Before this, most handlers invoked them bare: a native failure
     * either rejected the request or, for anything the addon could not convert to
     * a JS error, took the whole server process down with it.
     */
    private guard<T>(operation: string, fn: () => T, fallback: T, fsPath?: string, position?: BreadcrumbPosition): T {
        beginOperation(operation, fsPath, position);
        try {
            return fn();
        } catch (ex) {
            this.logError(`${operation} failed`, ex);
            return fallback;
        } finally {
            endOperation();
        }
    }

    /**
     * Aborts a request the client has already given up on.
     *
     * VSCode cancels superseded requests as the user keeps typing: the hover
     * from two keystrokes ago, a completion list the editor has since
     * dismissed. Every one of them still cost a full compile, because
     * `ensureAnalyzed()` sits behind almost every handler below.
     *
     * This answers with the protocol's `RequestCancelled` rather than an empty
     * result on purpose. Several of these requests drive persistent editor
     * state -- semantic tokens are the file's highlighting, diagnostics are the
     * Problems panel -- and an empty success would blank it. An error response
     * leaves the client holding what it already had.
     */
    private throwIfCancelled(token?: CancellationToken): void {
        if (token?.isCancellationRequested) {
            throw new ResponseError(LSPErrorCodes.RequestCancelled, 'Request cancelled');
        }
    }

    private onInitialize = async (params: InitializeParams): Promise<InitializeResult> => {

        // Indented: the client capabilities blob is several KB and unreadable
        // as a single line in the output channel.
        this.log(`Got initialization params ${JSON.stringify(params.capabilities, null, 2)}`);
        const workspaceFolders = params.workspaceFolders ?? [];
        const initializationOptions: InitializationOptions = params.initializationOptions;

        try {
            await mkdir(LSPServer.options.storageFsPath, { recursive: true });
        } catch (ex) {
            this.logError(`Could not create storage directory '${LSPServer.options.storageFsPath}'`, ex);
        }

        let found = false;
        for (const { uri } of workspaceFolders) {
            const { fsPath } = URI.parse(uri);
            const polCfg = join(fsPath, 'pol.cfg');
            const ecompileCfg = join(fsPath, 'scripts', 'ecompile.cfg');

            try {
                await access(polCfg, F_OK);
                await access(ecompileCfg, F_OK);
                beginOperation('workspace/open', fsPath);
                try {
                    this.workspace.open(fsPath);
                } finally {
                    endOperation();
                }
                this.log(`Successfully read ${ecompileCfg}. Loading cache...`);

                found = true;
            } catch (e) {
                this.logError(`Error reading ${ecompileCfg}`, e);
            }
        }

        if (found) {
            this.onDidChangeConfiguration(initializationOptions);
        } else {
            this.log(`Could not find pol.cfg;scripts/ecompile.cfg in [${workspaceFolders.map(x => x.uri).join(', ')}]`);
        }

        try {
            ExtensionConfiguration.setFromObject(initializationOptions?.configuration ?? {});
        } catch (e) {
            this.logError('Error setting native configuration', e);
        }

        this.hasDiagnosticRelatedInformationCapability = Boolean(params.capabilities.textDocument?.publishDiagnostics?.relatedInformation);

        const result: InitializeResult = {
            capabilities: {
                documentFormattingProvider: true,
                documentRangeFormattingProvider: true,
                textDocumentSync: TextDocumentSyncKind.Incremental,
                diagnosticProvider: {
                    interFileDependencies: true,
                    workspaceDiagnostics: false
                },
                hoverProvider: true,
                definitionProvider: true,
                completionProvider: {
                    triggerCharacters: [':', '.']
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
                },
                documentSymbolProvider: true
            }
        };

        return result;
    };

    /**
     * Marks a document, plus every open document that includes it, as needing
     * re-analysis.
     */
    private markDirty(fsPath: string): void {
        this.dirty.add(fsPath);

        for (const dependeePathname of this.sources.keys()) {
            if (dependeePathname === fsPath || this.dirty.has(dependeePathname)) {
                continue;
            }
            if ((this.dependsOn.get(dependeePathname) ?? []).includes(fsPath)) {
                this.dirty.add(dependeePathname);
            }
        }
    }

    /**
     * Brings a document's analysis up to date if it is stale. Safe to call
     * before any request that reads the syntax tree; a no-op when clean.
     */
    private ensureAnalyzed(fsPath: string, document: typeof LSPDocument): void {
        if (!this.dirty.has(fsPath)) {
            return;
        }
        this.dirty.delete(fsPath);

        if (isCachedParseTreeFile(fsPath)) {
            this.workspace.clearParseTreeCache();
        }

        document.analyze(this.configuration?.continueAnalysisOnError);
        this.dependsOn.set(fsPath, document.dependents());
    }

    private onDidOpen = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { fsPath } = URI.parse(e.document.uri);
        const document = this.guard('textDocument/didOpen', () => this.workspace.getDocument(fsPath), undefined, fsPath);
        if (document) {
            this.sources.set(fsPath, document);
            this.markDirty(fsPath);
        }
    };

    private onDidClose = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;
        const { fsPath } = URI.parse(uri);

        const document = this.sources.get(fsPath);
        this.sources.delete(fsPath);
        this.dirty.delete(fsPath);
        this.dependsOn.delete(fsPath);

        // The native workspace caches documents indefinitely, so the syntax
        // tree has to be handed back explicitly or it outlives the editor tab.
        if (document) {
            this.guard('textDocument/didClose', () => document.release(), undefined, fsPath);
        }
    };

    private onDidChangeContent = async (e: TextDocumentChangeEvent<TextDocument>) => {
        const { uri } = e.document;

        const { fsPath } = URI.parse(uri);
        if (!this.sources.has(fsPath)) {
            this.logError(`textDocument/didChange for a document that was never opened: ${fsPath}`);
            return;
        }

        // Deliberately does no work here: the next request that needs the tree
        // triggers exactly one analysis.
        this.markDirty(fsPath);
    };

    private onDocumentDiagnostics = async (e: DocumentDiagnosticParams, token?: CancellationToken): Promise<DocumentDiagnosticReport> => {
        this.throwIfCancelled(token);

        const { uri } = e.textDocument;
        const { fsPath } = URI.parse(uri);

        const empty: DocumentDiagnosticReport = {
            kind: DocumentDiagnosticReportKind.Full,
            items: []
        };

        return this.guard<DocumentDiagnosticReport>('textDocument/diagnostic', () => {
            let document = this.sources.get(fsPath);
            if (!document) {
                document = this.workspace.getDocument(fsPath);
                this.sources.set(fsPath, document);
                this.markDirty(fsPath);
            }
            this.ensureAnalyzed(fsPath, document);
            const diagnostics = document.diagnostics();

            const relatedDocuments: {[uri: DocumentUri]: FullDocumentDiagnosticReport} = {};

            for (const [dependeePathname, dependeeDoc] of this.sources.entries()) {
                // Uses the cached dependency list rather than calling across
                // N-API for every open document, and re-analyzes only those the
                // change actually invalidated.
                if (dependeePathname !== fsPath && (this.dependsOn.get(dependeePathname) ?? []).includes(fsPath)) {
                    const dependeeUri = URI.file(dependeePathname).toString();
                    this.ensureAnalyzed(dependeePathname, dependeeDoc);
                    relatedDocuments[dependeeUri] = {
                        kind: DocumentDiagnosticReportKind.Full,
                        items: dependeeDoc.diagnostics()
                    };
                }
            }
            return {
                kind: DocumentDiagnosticReportKind.Full,
                items: diagnostics,
                relatedDocuments
            };
        }, empty, fsPath);
    };

    private onDidChangeWatchedFiles = (e: DidChangeWatchedFilesParams) => {
        const ecompileCfg = join(this.workspace.workspaceRoot, 'scripts', 'ecompile.cfg');
        const shouldReopen = e.changes.some(change => change.type === FileChangeType.Changed && URI.parse(change.uri).fsPath === ecompileCfg);

        // An include or module file changed on disk (git checkout, external
        // edit): anything cached from it is now stale.
        const changedIncludes = e.changes
            .map(change => URI.parse(change.uri).fsPath)
            .filter(isCachedParseTreeFile);

        if (changedIncludes.length) {
            this.guard('workspace/invalidateParseTreeCache', () => this.workspace.clearParseTreeCache(), undefined);
            // Open documents including these files now hold stale analyses.
            changedIncludes.forEach(changed => this.markDirty(changed));
        }

        if (shouldReopen) {
            const hasChanges = this.guard('workspace/didChangeWatchedFiles', () => this.workspace.reopen(), false, ecompileCfg);
            if (hasChanges) {
                // reopen() drops the native document cache, but the reference
                // index build is memoized in JS and a finished one answers
                // instantly -- which is exactly what keeps repeat
                // textDocument/references cheap. Unless it is dropped here the
                // index is never rebuilt for the new configuration. Done
                // regardless of the setting, so that re-enabling workspace
                // references later does not resurrect a stale index.
                this.guard('workspace/invalidateReferenceCache', () => this.workspace.invalidateReferenceCache(), undefined);

                if (this.configuration?.disableWorkspaceReferences === false) {
                    this.updateCache();
                }
            }
        }
    };

    private onDocumentSymbol = (params: DocumentSymbolParams, token?: CancellationToken): DocumentSymbol[] | null => {
        this.throwIfCancelled(token);

        const { fsPath } = URI.parse(params.textDocument.uri);
        const document = this.sources.get(fsPath);

        return this.guard('textDocument/documentSymbol', () => {
            if (!document) {
                return null;
            }
            this.ensureAnalyzed(fsPath, document);
            return document.symbols() ?? null;
        }, null, fsPath);
    };

    private onSemanticTokens = async (params: SemanticTokensParams, token?: CancellationToken): Promise<SemanticTokens> => {
        this.throwIfCancelled(token);

        const builder = new SemanticTokensBuilder();
        const { fsPath } = URI.parse(params.textDocument.uri);
        const document = this.sources.get(fsPath);
        if (!document) {
            this.logError(`textDocument/semanticTokens for a document that was never opened: ${fsPath}`);
            return builder.build();
        }

        this.guard('textDocument/semanticTokens', () => {
            this.ensureAnalyzed(fsPath, document);
            // Already sorted by position on the native side.
            const tokens = document.tokens();

            for (let i = 0; i + 4 < tokens.length; i += 5) {
                builder.push(tokens[i], tokens[i + 1], tokens[i + 2], tokens[i + 3], tokens[i + 4]);
            }
        }, undefined, fsPath);

        return builder.build();
    };

    private onHover = (params: HoverParams, token?: CancellationToken): Hover | null => {
        this.throwIfCancelled(token);

        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        return this.guard('textDocument/hover', () => {
            if (document) {
                this.ensureAnalyzed(fsPath, document);
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
        }, null, fsPath, position);
    };

    private onDocumentRangeFormatting = async (params: DocumentRangeFormattingParams): Promise<TextEdit[] | null | undefined> => {
        const { textDocument: { uri }, options, range } = params;
        return this.getFormattedTextEdit(uri, options, range);
    };

    private onDocumentFormatting = async (params: DocumentFormattingParams): Promise<TextEdit[] | null | undefined> => {
        const { textDocument: { uri }, options } = params;
        return this.getFormattedTextEdit(uri, options);
    };

    private onDefinition = async (params: DefinitionParams, token?: CancellationToken): Promise<Location | null> => {
        this.throwIfCancelled(token);

        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        return this.guard('textDocument/definition', () => {
            if (document) {
                this.ensureAnalyzed(fsPath, document);
                const definition = document.definition(position);
                if (definition) {
                    return {
                        range: definition.range,
                        uri: URI.file(definition.fsPath).toString()
                    };
                }
            }
            return null;
        }, null, fsPath, position);
    };

    private onCompletion = async (params: CompletionParams, token?: CancellationToken): Promise<CompletionItem[] | null> => {
        this.throwIfCancelled(token);

        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        return this.guard('textDocument/completion', () => {
            if (document) {
                this.ensureAnalyzed(fsPath, document);
                const completion = document.completion(position);
                if (completion) {
                    return completion;
                }
            }
            return null;
        }, null, fsPath, position);
    };

    private onSignatureHelp = async (params: SignatureHelpParams, token?: CancellationToken): Promise<SignatureHelp | null> => {
        this.throwIfCancelled(token);

        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };
        const document = this.sources.get(fsPath);
        return this.guard('textDocument/signatureHelp', () => {
            if (!document) {
                return null;
            }
            this.ensureAnalyzed(fsPath, document);
            return document.signatureHelp(position) ?? null;
        }, null, fsPath, position);
    };

    private onDidChangeConfiguration = (params: DidChangeConfigurationParams): void => {
        if (deepEquals(this.configuration, params.configuration)) {
            return;
        }

        this.log(`ExtensionConfiguration changed: ${JSON.stringify(params.configuration)}`);
        this.configuration = params.configuration;

        try {
            ExtensionConfiguration.setFromObject(params.configuration ?? {});
        } catch (e) {
            this.logError('Error setting native configuration', e);
        }

        if (this.downloader.commitId === '' || params.configuration.polCommitId !== this.downloader.commitId) {
            this.downloader.start(this.workspace.workspaceRoot, this.workspace.getConfigValue('ModuleDirectory'), params.configuration.polCommitId).catch(e => {
                this.logWarn(`Could not download polserver documentation: ${formatError(e)}`);
            });
        }

        if (params.configuration.disableWorkspaceReferences === false) {
            this.updateCache();
        } else {
            this.updateCacheAbortController?.abort();
            this.updateCacheAbortController = undefined;
        }
    };

    private onReferences = async (params: ReferenceParams): Promise<Location[] | null | undefined> => {
        const { fsPath } = URI.parse(params.textDocument.uri);
        const { position: { line, character } } = params;
        const position: Position = { line: line + 1, character: character + 1 };

        if (this.configuration?.disableWorkspaceReferences === false) {
            try {
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
            } catch (ex) {
                this.logError('Building the workspace reference cache failed', ex);
                return undefined;
            }
        }

        const document = this.sources.get(fsPath);
        return this.guard('textDocument/references', () => {
            if (document) {
                this.ensureAnalyzed(fsPath, document);
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
        }, null, fsPath, position);
    };

    private updateCache() {
        // Since the updateCache runs on next tick, it's possible (though
        // unlikely) that multiple calls to onDidChangeConfiguration()
        // occurred. Cancel any existing updateCache task.
        this.updateCacheAbortController?.abort();

        const updateCacheAbortController = this.updateCacheAbortController = new AbortController();

        // Must do next tick because `window/workDoneProgress/create` will not be registered yet.
        process.nextTick(async () => {
            // Every await and every native call below is inside this try: an
            // unhandled rejection here used to terminate the server outright,
            // and it runs during startup indexing where it is least visible.
            try {
                const serverInitiatedReporter = await this.connection.window.createWorkDoneProgress();
                serverInitiatedReporter.begin('Workspace Cache');
                const before = this.profileSnapshot();
                const startedAt = Date.now();
                try {
                    await this.workspace.updateCache(({ count, total }) => {
                        serverInitiatedReporter.report(100 * count / total, `Reading files ${count}/${total}`);
                    }, updateCacheAbortController.signal);
                    this.log(`Cache loaded in ${Date.now() - startedAt}ms.`);
                    this.logProfile('workspace cache build', before);
                } finally {
                    serverInitiatedReporter.done();
                }
            } catch (ex) {
                this.logError('Building the workspace cache failed', ex);
            }
        });
    }

    private getFormattedTextEdit(uri: string, options: FormattingOptions, range?: Range): TextEdit[] | null {
        const { fsPath } = URI.parse(uri);
        const document = this.sources.get(fsPath);

        if (!document) {
            return null;
        }

        const textDocument = this.documents.get(uri);

        if (!textDocument) {
            return null;
        }

        this.guard('textDocument/formatting/analyze', () => this.ensureAnalyzed(fsPath, document), undefined, fsPath);

        const formatted = this.guard('textDocument/formatting', () => range ?
            document.toFormattedString(options, {
                start: { line: range.start.line + 1, character: range.start.character },
                end: { line: range.end.line + 1, character: range.end.character }
            }) :
            document.toFormattedString(options), undefined, fsPath);

        if (typeof formatted === 'undefined') {
            return null;
        }

        const originalText = textDocument.getText();

        const edit: TextEdit = {
            range: {
                start: {line:0,character:0},
                end: textDocument.positionAt(originalText.length)
            },
            newText: formatted
        };

        return [edit];
    }
}
