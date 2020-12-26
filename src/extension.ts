import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as path from 'path';
import { workspace, ExtensionContext, window, OutputChannel, WorkspaceFoldersChangeEvent } from 'vscode';
import { platform } from 'os';
import { promises as fsPromises } from 'fs';
import stat = fsPromises.stat;

const ECOMPILE_SUBPATH = path.join('scripts', platform() === 'win32' ? 'ecompile.exe' : 'ecompile');

let client: LanguageClient | null = null;
let traceOutputChannel: OutputChannel | null = null;

export async function activate(context: ExtensionContext) {

    const startLanguageClient = (ecompilePath: string) => {
        if (client) {
            return;
        }

        const serverOptions: ServerOptions = {
            command: ecompilePath,
            args: ['-j'],
            options: {
                cwd: path.dirname(ecompilePath),
            },
            transport: TransportKind.stdio,
        };

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: [{ scheme: 'file', language: 'escript' }],
            synchronize: {
                // Notify the server about file changes to '.clientrc files contained in the workspace
                fileEvents: workspace.createFileSystemWatcher('**/*.{inc,em,src,cfg}')
            }
        };

        // Create the language client and start the client.
        client = new LanguageClient(
            'escript-lsp',
            'ECompile Language Server',
            serverOptions,
            clientOptions
        );

        client.start();

        return client.onReady();
    };

    const stopLanguageClient = () => client?.stop();

    const scanWorkspaceFolders = async () => {
        let ecompilePath: string = workspace.getConfiguration('escript.ecompile').path;
        if (ecompilePath) {
            return ecompilePath;
        }
        for (const workspaceFolder of workspace.workspaceFolders ?? []) {
            ecompilePath = path.join(workspaceFolder.uri.fsPath, ECOMPILE_SUBPATH);
            try {
                await stat(ecompilePath);
                return ecompilePath;
            } catch {
            }
        }
    };

    const onDidChangeWorkspaceFolders = async () => {
        if (client) {
            await stopLanguageClient();
            client = null;
        }

        const ecompilePath = await scanWorkspaceFolders();
        if (ecompilePath) {
            traceOutputChannel?.dispose();
            return startLanguageClient(ecompilePath);
        }

        traceOutputChannel = window.createOutputChannel('ECompile Language Server');
        traceOutputChannel.appendLine(`Could not find ecompile. Ensure a workspace that contains "${ECOMPILE_SUBPATH}" is loaded. Or, you may set the 'escript.ecompile.path' configuration setting.`);
    };

    workspace.onDidChangeWorkspaceFolders(onDidChangeWorkspaceFolders);

    return onDidChangeWorkspaceFolders();
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
