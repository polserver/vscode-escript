import { LanguageClient, TextDocumentIdentifier, ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageclient';
import { ExtensionContext, commands } from 'vscode';
import { OpenAstRequestCommand, OpenAstResponseCommand } from 'escript-common';
import * as vscode from 'vscode';

const OpenAstCommand = 'myExtension.sayHello';

type ExtensionContextSubscriptions = ExtensionContext['subscriptions']
export class CommandHandler {

    constructor(private client: LanguageClient, subscriptions: ExtensionContextSubscriptions) {
        this.attachSubscriptions(subscriptions);
        this.attachCommands();
    }

    private attachSubscriptions(subscriptions: ExtensionContextSubscriptions) {
        subscriptions.push(commands.registerCommand(OpenAstCommand, this.onOpenAstCommand.bind(this)));
    }

    private attachCommands() {
        this.client.onRequest(ExecuteCommandRequest.type, this.onExecuteCommand.bind(this));
    }

    private async onExecuteCommand(type: ExecuteCommandParams) {
        if (OpenAstResponseCommand.is<OpenAstResponseCommand>(type)) {
            const { ast } = type.arguments[0];
            const document = await vscode.workspace.openTextDocument({
                language: 'json',
                content: JSON.stringify(ast, undefined,2 ),
            });

            vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside
            });
        }
    }

    private onOpenAstCommand(name: string = 'world') {
        try {
            const tdi: TextDocumentIdentifier = {
                uri: vscode.window.activeTextEditor.document.uri.toString()
            };
            const ecp = OpenAstRequestCommand.create(tdi);
            this.client.sendRequest(ExecuteCommandRequest.type, ecp);
        } catch (e) {
            console.error('Got error', e);
            throw e;
        }
    }
}