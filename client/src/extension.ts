/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { commands, workspace, ExtensionContext, TextDocument, CancellationToken } from 'vscode';
import {
    SemanticTokensFeature, DocumentSemanticsTokensSignature,
} from 'vscode-languageclient/lib/semanticTokens.proposed';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    Middleware,
    TextDocumentIdentifier,
    ExecuteCommandParams,
    ExecuteCommandRequest,
} from 'vscode-languageclient';
import * as vscode from 'vscode';
import { OpenAstRequestCommand, OpenAstResponseCommand } from 'escript-common';

let client: LanguageClient;

import { CommandHandler } from './commands';

export async function activate(context: ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ scheme: 'file', language: 'escript' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/*.{inc,em,src,cfg}')
        },
        middleware: {
            async provideDocumentSemanticTokens(
                document: TextDocument,
                token: CancellationToken,
                next: DocumentSemanticsTokensSignature,
            ) {
                const signature = await next(document, token);
                if (signature === null) { throw new Error('busy'); }
                // await new Promise(resolve => setTimeout(resolve, 5000));
                return signature;
            },
        } as Middleware,
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'languageServerExample',
        'Language Server Example',
        serverOptions,
        clientOptions
    );
    client.registerFeature(new SemanticTokensFeature(client));
    console.debug('We are registered!');
    // alert('registered!');

    // Start the client. This will also launch the server
    client.start();

    await client.onReady();

    new CommandHandler(client, context.subscriptions);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
