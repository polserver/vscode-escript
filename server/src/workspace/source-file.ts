import { extname } from 'path';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { AST } from '../semantics/pt-visitor';
import { LSPServer } from '../server/connection';

export enum SourceFileType {
	SRC,
	EM,
	INC,
	CFG,
	OTHER,
}
export namespace SourceFileType {
    export function toString(type: SourceFileType): string {
        return SourceFileType[type];
    }
	export function isCompilable(type: SourceFileType) {
	    return type === SourceFileType.SRC || type === SourceFileType.EM || type === SourceFileType.INC;
	}

    export function fromPath(uri: string) {
        const ext = extname(uri).toLowerCase();
	    switch (ext) {
	    case '.src': return SourceFileType.SRC;
	    case '.inc': return SourceFileType.INC;
	    case '.cfg': return SourceFileType.CFG;
	    case '.em': return SourceFileType.EM;
	    default: return SourceFileType.OTHER;
	    }
    }
}
export class SourceFile {
	private _document: TextDocument;
	public readonly type: SourceFileType;
    private _ast: AST | undefined;

    public constructor(document: TextDocument, process = true) {
	    this._document = document;
	    this.type = SourceFileType.fromPath(document.uri);
	    if (process) {
	        this.process();
	    }
    }

    public get document() {
	    return this._document;
    }

    public set document(value: TextDocument) {
	    this._document = value;
    }

    public get ast() {
	    return this._ast;
    }

    public process() {
	    if (SourceFileType.isCompilable(this.type)) {
	        this._ast = new AST(this);
	    }
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
