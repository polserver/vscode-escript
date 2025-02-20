import * as vscode from 'vscode';
import { PolDebugClient } from './PolDebugClient';

class PolDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new PolDebugAdapterTracker(session);
    }
}

class PolDebugAdapterTracker implements vscode.DebugAdapterTracker {
    constructor(private session: vscode.DebugSession) { }

    onWillReceiveMessage(message: any) {
        console.log('<-', JSON.parse(JSON.stringify(message)));
        if (message?.command === 'initialize') {
            const { password: sessionPassword } = this.session.configuration;
            if (typeof sessionPassword === 'string' && sessionPassword !== '') {
                message.arguments = message.arguments ?? {};
                message.arguments.password = sessionPassword;
            }
        }
    }

    onDidSendMessage(message: any) {
        console.log('->', JSON.parse(JSON.stringify(message)));
    }
}

const srcToEcl = (src: string) => String(src ?? '')
    .replace(/\\/g, '/') // POL only uses forward slashes
    .replace(/\.src$/, '.ecl'); // Replace .src with .ecl

class PolDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    async resolveDebugConfigurationWithSubstitutedVariables(_: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
        const { host = '127.0.0.1', port, password, pid, request, script } = config;

        if (!port) {
            vscode.window.showErrorMessage(`Missing "port" property in debug configuration.`).then(_ => { });
            return undefined;
        }

        if (request === 'attach') {
            if (!script && !pid) {
                vscode.window.showErrorMessage(`The "script" property is required in debug configuration for attaching if no "pid" provided.`).then(_ => { });
                return undefined;
            }

            if (!pid) {
                const filter = srcToEcl(script);

                let client: PolDebugClient;
                try {
                    client = await PolDebugClient.createConnection(host, port);

                    await client.request('initialize', { 'adapterID': 'vscode-escript', password });

                    const { body: { processes } } = await client.request('processes', { filter });

                    if (processes.length === 0) {
                        vscode.window.showErrorMessage(`No processes matching '${filter}' found.`).then(_ => { });
                        return undefined;
                    }

                    if (processes.length === 1) {
                        config.pid = processes[0].id;
                    } else {
                        const debugging: vscode.QuickPickItem[] = [];
                        const running: vscode.QuickPickItem[] = [];
                        const sleeping: vscode.QuickPickItem[] = [];

                        for (const { id, script, state } of processes) {
                            const item: vscode.QuickPickItem = { kind: vscode.QuickPickItemKind.Default, label: `${id} ${script}` };

                            if (state === 2) {
                                debugging.push(item);
                            } else if (state === 1) {
                                running.push(item);
                            } else {
                                sleeping.push(item);
                            }
                        }

                        if (debugging.length) {
                            debugging.unshift({
                                label: 'Debugging',
                                kind: vscode.QuickPickItemKind.Separator
                            });
                        }

                        if (running.length) {
                            running.unshift({
                                label: 'Running',
                                kind: vscode.QuickPickItemKind.Separator
                            });
                        }

                        if (sleeping.length) {
                            sleeping.unshift({
                                label: 'Sleeping',
                                kind: vscode.QuickPickItemKind.Separator
                            });
                        }

                        const selection = await vscode.window.showQuickPick(debugging.concat(running).concat(sleeping), { canPickMany: false });

                        if (!selection) {
                            return undefined;
                        }

                        const selectionPid = parseInt(selection.label, 10);
                        if (isNaN(selectionPid)) {
                            vscode.window.showErrorMessage(`Invalid selection: ${selection}`).then(_ => { });
                            return undefined;
                        }

                        config.pid = selectionPid;
                    }
                } catch (e) {
                    vscode.window.showErrorMessage(`Could not get process list from debug server: ${e.message}`).then(_ => { });
                    return undefined;
                } finally {
                    client?.destroy();
                }
            }
        }
        else if (request === 'launch') {
            if (!script) {
                vscode.window.showErrorMessage(`The "script" property is required in debug configuration for launching.`).then(_ => { });
                return undefined;
            }
            config.script = srcToEcl(script);
        }

        return config;
    }
}

class PolDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterServer(session.configuration.port, session.configuration.host);
    }
}

export function activatePolDebug(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('pol', new PolDebugConfigurationProvider()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('pol', new PolDebugAdapterTrackerFactory()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('pol', new PolDebugAdapterServerDescriptorFactory()));
}
