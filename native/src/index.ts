import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic, Position, Range, CompletionItem } from 'vscode-languageserver-types';

// The native module uses this specific format for a SignatureHelp
export type ParameterInformation = {
	label: [number, number]
}

export type SignatureInformation = {
	label: string;
	parameters: ParameterInformation[];
}

export type SignatureHelp = {
	label: string;
	signatures: Array<SignatureInformation>,
	activeSignature: 0, // No method overloading, so always 0
	activeParameter: number
}

export type LSPWorkspaceConfig = {
	getContents: (pathname: string) => string;
}

export interface LSPWorkspace {
	new(config: LSPWorkspaceConfig): LSPWorkspace;
	read(cfg: string): void;
}

export interface LSPDocument {
	new(workspace: LSPWorkspace, pathname: string): LSPDocument;
	analyze(): void;
	dependents(): string[];
	diagnostics(): Diagnostic[];
	hover(position: Position): string | undefined;
	completion(position: Position): CompletionItem[];
	definition(position: Position): { range: Range, fsPath: string } | undefined;
	signatureHelp(position: Position): SignatureHelp | undefined;
	tokens(): [line: number, startChar: number, length: number, tokenType: number, tokenModifiers: number][];
}


export interface EscriptVscodeNative {
	LSPWorkspace: LSPWorkspace;
	LSPDocument: LSPDocument;
}

const tries = [
    [__dirname, '..', 'build', 'Debug', 'vscode-escript-native.node'],
    [__dirname, '..', 'build', 'Release', 'vscode-escript-native.node'],
].map(segment => resolve(...segment));

const filename = tries.find(filepath => existsSync(filepath));

/* istanbul ignore next */
if (!filename) {
    throw new Error('Unable to locate vscode-escript-native.node');
}

export const native = require(filename) as EscriptVscodeNative;
