import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic } from 'vscode-languageserver-types';

export type LSPWorkspaceConfig = {
	getContents: (pathname: string) => string;
}

export interface LSPWorkspace {
	new(config: LSPWorkspaceConfig): LSPWorkspace;
	read(cfg: string): void;
	open(pathname: string): void;
	close(pathname: string): void;
	analyze(pathname: string): void;
	dependees(pathname: string): string[];
	diagnostics(pathname: string): Diagnostic[];
	tokens(pathname: string): [line: number, startChar: number, length: number, tokenType: number, tokenModifiers: number][];
}

export interface EscriptVscodeNative {
	LSPWorkspace: LSPWorkspace
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
