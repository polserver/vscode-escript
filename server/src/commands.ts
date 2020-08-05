import { OpenAstRequestCommand, OpenAstResponseCommand } from 'escript-common';
import { Connection, ExecuteCommandParams, ExecuteCommandRequest, CompletionItem, DefinitionParams, DefinitionLink, DocumentSymbolParams, DocumentSymbol, SymbolInformation, SignatureHelpParams, SignatureHelp, CompletionParams, HoverParams, Hover, CancellationToken, ResponseError, ErrorCodes } from 'vscode-languageserver';
import { EscriptSymbolBuilder } from './parser';

export class CommandHandler {
    constructor(private connection: Connection) {
        connection.onCompletion(this.onCompletion.bind(this));
        connection.onCompletionResolve(this.onCompletionResolve.bind(this));
        connection.onDefinition(this.onDefinition.bind(this));
        connection.onDocumentSymbol(this.getDocumentSymbols.bind(this));
        connection.onDocumentSymbol(this.getSymbolInformations.bind(this));
        connection.onSignatureHelp(this.getSignatureHelp.bind(this));
        connection.onExecuteCommand(this.onExecuteCommand.bind(this));
        connection.onHover(this.onHover.bind(this));
    }

    async onHover(params: HoverParams): Promise<Hover | null | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);
        if (builder instanceof EscriptSymbolBuilder) {
            return builder.getHover(params.position);
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }
    }

    async onCompletion(params: CompletionParams): Promise<CompletionItem[] | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);
        if (builder instanceof EscriptSymbolBuilder) {
            return builder.getCompletionItems(params.position);
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }
    }

    onCompletionResolve(item: CompletionItem): CompletionItem {
        return item;
    }

    async onDefinition(params: DefinitionParams): Promise<DefinitionLink[] | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);
        if (builder instanceof EscriptSymbolBuilder) {
            const definition = builder.getDefinitionAt(params.position);
            console.log('Go-to definition returning', definition);
            return definition ? [definition] : [];
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }

    }

    // Local symbols
    async getDocumentSymbols(params: DocumentSymbolParams): Promise<DocumentSymbol[] | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);

        if (builder instanceof EscriptSymbolBuilder) {
            return builder.getLocalSymbols();
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }
    }

    // External symbols
    async getSymbolInformations(params: DocumentSymbolParams): Promise<SymbolInformation[] | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);
        if (builder instanceof EscriptSymbolBuilder) {
            return builder.getExternalSymbols();
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }
    }

    async getSignatureHelp(params: SignatureHelpParams, x: CancellationToken): Promise<SignatureHelp | null | ResponseError<void>> {
        let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(uri);
        if (builder instanceof EscriptSymbolBuilder) {
            return builder.getSignatureHelp(params.position);
        } else if (builder.reason === 'cancel') {
            return new ResponseError(ErrorCodes.RequestCancelled, 'Request Cancelled');
        }  else {
            return new ResponseError(ErrorCodes.ParseError, builder.details);
        }
    }

    async onExecuteCommand(params: ExecuteCommandParams) {
        if (OpenAstRequestCommand.is<OpenAstRequestCommand>(params)) {
            this.onOpenAstRequestCommand(params);
        }
    }

    private async onOpenAstRequestCommand(params: OpenAstRequestCommand) {
        const { textDocument } = params.arguments[0];
        // const { uri } = textDocument;
        // console.log('param arguments are', textDocument);
        // let uri = params.textDocument.uri;
        const builder = await EscriptSymbolBuilder.create(textDocument.uri);
        if (builder instanceof EscriptSymbolBuilder) {
            const ast = builder.astToJSON();
            // return builder.getCompletionItems(params.position);
            const response: OpenAstResponseCommand = {
                command: OpenAstResponseCommand.command,
                arguments: [
                    { textDocument, ast }
                ]
            };
            console.log('sending response', response);
            this.connection.sendRequest(ExecuteCommandRequest.type, response);
        }
    }
}