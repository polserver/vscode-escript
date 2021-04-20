import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic, Position, Range } from 'vscode-languageserver-types';

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
	definition(position: Position): { range: Range, fsPath: string } | undefined;
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

if (!filename) {
    throw new Error('Unable to locate vscode-escript-native.node');
}

export const native = require(filename) as EscriptVscodeNative;
