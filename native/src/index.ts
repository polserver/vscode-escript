import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic } from 'vscode-languageserver-types';

export type LSPWorkspaceConfig = {
	cfg: string;
	getContents: (pathname: string) => string;
}

export interface LSPWorkspace {
	new(config: LSPWorkspaceConfig): LSPWorkspace;
	open(pathname: string): void;
	close(pathname: string): void;
	diagnose(pathname: string): Diagnostic[];
}

// FIXME: remove, used for POC
interface hello {
	(moduleDirectory: string, contents: string): Diagnostic[];
}
export interface EscriptVscodeNative {
	LSPWorkspace: LSPWorkspace,
	hello: hello
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
