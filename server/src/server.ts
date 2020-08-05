/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DocumentSymbolParams,
    SymbolInformation,
    SymbolKind,
    Location,
    Range,
    SymbolTag,
    DocumentSymbol,
    TextDocumentIdentifier,
    Definition,
    DefinitionLink,
    DefinitionParams,
    CompletionParams,
    FileChangeType,
    SignatureHelp,
    SignatureHelpParams,
    Command,
    ExecuteCommandParams,
    ExecuteCommandRequest,
    ResponseError,
    ErrorCodes,
} from 'vscode-languageserver';

import {
    SemanticTokensParams, SemanticTokensServerCapabilities, SemanticTokensLegend
} from 'vscode-languageserver-protocol/lib/protocol.semanticTokens.proposed';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { EscriptSymbolBuilder, TextDocumentCache } from './parser';
import { TokensLegend } from './grammars/ast-visitor';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

// connection.onExecuteCommand(onExecuteCommand);
import { CommandHandler } from './commands';
import { EscriptWorkspacePathDetails } from './workspace';
const x = new CommandHandler(connection);


connection.languages.semanticTokens.on(getSemanticTokens);

async function getSemanticTokens(semanticTokensParams: SemanticTokensParams) {
    const document = documents.get(semanticTokensParams.textDocument.uri);
    if (document === undefined) {
        return {
            data: []
        };
    }
    // const builder = await getTokenBuilder(document);
    try {
        console.log('Semantic tokens creating builder');
        const builder = await EscriptSymbolBuilder.create(document);

        if (builder instanceof EscriptSymbolBuilder) {
            console.log('Semantic tokens got builder');
            return builder.getSemanticTokens();
        } else if (builder.reason === 'cancel') {
            console.error('Semantic tokens got cancelled builder');
            return new ResponseError<void>(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            console.error('Semantic tokens got errored builder');
            return new ResponseError<void>(ErrorCodes.ParseError, builder.details);
        }
    } catch (e) {
        console.error('Error getting token builder', e);
        return {
            data: []
        };
    }
    //TODO store wdoc somewhere instead of recalculating
}

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );


    const result: InitializeResult & { capabilities: SemanticTokensServerCapabilities } = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.']
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: [',', '(']
            },
            definitionProvider: true,
            documentSymbolProvider: true,
            semanticTokensProvider: {
                legend: TokensLegend
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

async function prepareWorkspaces(): Promise<void> {
    if (prepareWorkspaces.prepared) {
        return prepareWorkspaces.prepared;
    }
    prepareWorkspaces.prepared = new Promise(resolve => {
        if (hasWorkspaceFolderCapability) {
            connection.workspace.getWorkspaceFolders().then(folders => {
                console.log('folders are', folders);
                if (folders) {
                    folders.forEach((folder, i) => {
                        EscriptWorkspacePathDetails.find(folder.uri, { recurse: false, types: true })
                            .then(details => {
                                console.log('found details', details);
                                if (i === folders.length-1) {
                                    resolve();
                                }
                            })
                            .catch( /** @TODO proper error handler */);
                    });
                    
                }
                // connection.workspace.onDidChangeWorkspaceFolders(_event => {
                //     connection.console.log('Workspace folder change event received.');
                // });
            });
        }
    });
}
prepareWorkspaces.prepared = undefined as Promise<void> | undefined;

connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
        await prepareWorkspaces();
    }
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
    // documents.all().forEach(validateTextDocument);
});


function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
    console.log('document opened!', change.document.uri);
    // We don't need the result
    const { document } = change;
    TextDocumentCache.put(document);
    // await new Promise(resolve => setTimeout(resolve, 100000));
    const builder = await EscriptSymbolBuilder.create(document);
    if (builder instanceof EscriptSymbolBuilder) {
        console.log('opened document got builder');
        connection.sendDiagnostics(builder.getDiagnostics());
    } else if (builder.reason === 'cancel') {
        console.error('opened document got cancelled builder');
    }  else if (builder.reason === 'error') {
        console.error('opened document got errored builder');
    }

});

documents.onDidClose(change => {
    const { document } = change;
    console.log('document closed!', change.document.uri);
    TextDocumentCache.close(document);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});


connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    console.log('We received an file change event');
    for (const change of _change.changes) {
        TextDocumentCache.invalidate(change.uri, change.type);
    }
});

/*

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Function,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            // item.//
            // console.log()
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
);


connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.textDocument.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.textDocument.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
