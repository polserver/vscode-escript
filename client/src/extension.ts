/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext, Uri, Disposable } from 'vscode';

import { activatePolDebug } from './activatePolDebug';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

/**
 * Whether any workspace folder is a POL distribution.
 *
 * This is the same test the server applies in `onInitialize`: without both files
 * it never calls `workspace.open()`, so `compilercfg` is never read and no
 * analysis can work. Checking here as well means a workspace the server would
 * have rejected does not get a forked Node process and a 2.6 MB native addon
 * loaded into it first.
 *
 * It matters because the extension activates more widely than it can serve:
 * `contributes.languages` binds `escriptcfg` to `.cfg`, so opening a `setup.cfg`
 * in an unrelated project activates this extension.
 */
async function isPolWorkspace(): Promise<boolean> {
    for (const folder of workspace.workspaceFolders ?? []) {
        try {
            await workspace.fs.stat(Uri.joinPath(folder.uri, 'pol.cfg'));
            await workspace.fs.stat(Uri.joinPath(folder.uri, 'scripts', 'ecompile.cfg'));
            return true;
        } catch {
            // Not a POL distribution; try the next folder.
        }
    }
    return false;
}

function startClient(context: ExtensionContext): LanguageClient {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join('dist', 'server.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
    const args = [`--storageUri=${context.storageUri}`];

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
            args
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
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

    const started = new LanguageClient(
        'escript',
        'EScript Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    started.start();

    return started;
}

export async function activate(context: ExtensionContext) {
    // Cheap and unconditional: registering the debug providers costs nothing and
    // must happen before a 'pol' session is resolved.
    activatePolDebug(context);

    workspace.onDidChangeConfiguration(e => {
        // Without this check every settings change in the window -- including
        // unrelated extensions' -- pushes a config notification, which can
        // restart the workspace cache build.
        if (!e.affectsConfiguration('escript')) {
            return;
        }
        client?.sendNotification('didChangeConfiguration', {
            configuration: workspace.getConfiguration('escript')
        });
    }, undefined, context.subscriptions);

    const startIfPol = async () => {
        if (client || !await isPolWorkspace()) {
            return;
        }
        client = startClient(context);
    };

    // A POL distribution can be added to the window after activation, so the
    // check has to be repeated rather than made once at startup.
    let folderWatch: Disposable | undefined = workspace.onDidChangeWorkspaceFolders(async () => {
        await startIfPol();
        if (client) {
            folderWatch?.dispose();
            folderWatch = undefined;
        }
    });
    context.subscriptions.push({ dispose: () => folderWatch?.dispose() });

    await startIfPol();
    if (client) {
        folderWatch.dispose();
        folderWatch = undefined;
    }
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
