import { createConnection, TextDocuments, TextDocumentChangeEvent, ProposedFeatures, InitializeParams, TextDocumentSyncKind, InitializeResult } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { validateTextDocument } from '../semantics/analyzer';

export class LSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

    public hasDiagnosticRelatedInformationCapability: boolean = false;

    private static _instance: LSPServer | undefined;
    public static get instance(): LSPServer {
        return LSPServer._instance ?? (LSPServer._instance = new LSPServer());
    }

    private constructor() {
        this.connection.onInitialize(this.onInitialize);
        this.documents.onDidChangeContent(this.onDidChangeContent);
        this.documents.listen(this.connection);
    }

    public listen() {
        this.connection.listen();
    }

    private onInitialize = (params: InitializeParams): InitializeResult => {
        this.hasDiagnosticRelatedInformationCapability = Boolean(params.capabilities.textDocument?.publishDiagnostics?.relatedInformation);

        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
            }
        };
    }

    private onDidChangeContent = (e: TextDocumentChangeEvent<TextDocument>) => {
        this.connection.sendDiagnostics({
            uri: e.document.uri,
            diagnostics: validateTextDocument(e.document)
        });
    };

}
