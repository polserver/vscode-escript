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

class PolDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    async resolveDebugConfigurationWithSubstitutedVariables(_: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
        const { host, port, password, pid, request, script } = config;

        if (!host) {
            vscode.window.showErrorMessage(`Missing "host" property in debug configuration.`).then(_ => { });
            return undefined;
        }

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
                const filter = String(script ?? '')
                    .replace(/\\/g,'/') // POL only uses forward slashes
                    .replace(/\.src$/, '.ecl'); // Replace .src with .ecl

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
                        const selection = await vscode.window.showQuickPick(processes.map(({ id, program, state }) => `${id} ${program} ${state}`), { canPickMany: false });
                        if (!selection) {
                            return undefined;
                        }

                        const selectionPid = parseInt(selection, 10);
                        if (isNaN(selectionPid)) {
                            vscode.window.showErrorMessage(`Invalid selection: ${selection}`).then(_ => { });
                            return undefined;
                        }

                        config.pid = selectionPid;
                    }
                } catch (e) {
                    vscode.window.showErrorMessage(`Could not get process list from debug server: ${e}`).then(_ => { });
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
