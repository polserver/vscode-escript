/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import { activatePolDebug } from './activatePolDebug';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'index.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
    const args = [`--storageUri=${context.storageUri}`];

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
            args
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
        initializationOptions: {
            configuration: workspace.getConfiguration('escript')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'escript',
        'EScript Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();

    activatePolDebug(context);

    workspace.onDidChangeConfiguration(e => {
        client.sendNotification('didChangeConfiguration', {
            configuration: workspace.getConfiguration('escript')
        });
    });
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
