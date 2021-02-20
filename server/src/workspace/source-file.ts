import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LSPServer } from '../server/connection';

export class SourceFile {
	private _document: TextDocument;

	public constructor(document: TextDocument) {
	    this._document = document;
	}

	public get document() {
	    return this._document;
	}

	public set document(value: TextDocument) {
	    this._document = value;
	}

	public getDiagnostics(): Diagnostic[] {
	    // The validator creates diagnostics for all uppercase words length 2 and more
	    let text = this._document.getText();
	    let pattern = /\b[A-Z]{2,}\b/g;
	    let m: RegExpExecArray | null;

	    let diagnostics: Diagnostic[] = [];
	    while ((m = pattern.exec(text))) {
	        let diagnostic: Diagnostic = {
	            severity: DiagnosticSeverity.Warning,
	            range: {
	                start: this._document.positionAt(m.index),
	                end: this._document.positionAt(m.index + m[0].length)
	            },
	            message: `${m[0]} is all uppercase.`,
	            source: 'ex'
	        };
	        if (LSPServer.instance.hasDiagnosticRelatedInformationCapability) {
	            diagnostic.relatedInformation = [
	                {
	                    location: {
	                        uri: this._document.uri,
	                        range: Object.assign({}, diagnostic.range)
	                    },
	                    message: 'Spelling matters'
	                },
	                {
	                    location: {
	                        uri: this._document.uri,
	                        range: Object.assign({}, diagnostic.range)
	                    },
	                    message: 'Particularly for names'
	                }
	            ];
	        }
	        diagnostics.push(diagnostic);
	    }

	    return diagnostics;
	}
}
