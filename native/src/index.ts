import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic, Position, Range, CompletionItem, Location } from 'vscode-languageserver-types';

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
    getXmlDocPath?: (moduleEmFile: string) => string | null;
}

export interface LSPWorkspace {
    new(config: LSPWorkspaceConfig): LSPWorkspace;
    workspaceRoot: string;
    open(workspaceRoot: string): void;
    getConfigValue(key: 'PackageRoot'): Array<string>;
    getConfigValue(key: 'IncludeDirectory' | 'ModuleDirectory' | 'PolScriptRoot'): string;
}

export interface LSPDocument {
    new(workspace: LSPWorkspace, pathname: string): LSPDocument;
    analyze(continueOnError?: boolean): void;
    dependents(): string[];
    diagnostics(): Diagnostic[];
    hover(position: Position): string | undefined;
    completion(position: Position): CompletionItem[];
    definition(position: Position): { range: Range, fsPath: string } | undefined;
    signatureHelp(position: Position): SignatureHelp | undefined;
    tokens(): [line: number, startChar: number, length: number, tokenType: number, tokenModifiers: number][];
    references(position: Position): Location[] | undefined;
}

export interface ExtensionConfiguration {
    polCommitId: string;
    showModuleFunctionComments: boolean;
    continueAnalysisOnError: boolean;
}

export interface EscriptVscodeNative {
    LSPWorkspace: LSPWorkspace;
    LSPDocument: LSPDocument;
    ExtensionConfiguration: {
        setFromObject(settings: Partial<ExtensionConfiguration>): void
        get(setting: 'polCommitId'): string;
        get(setting: 'showModuleFunctionComments'): boolean;
        get(setting: 'continueAnalysisOnError'): boolean;
    }
}

const baseFilename = `vscode-escript-native.${process.platform}-${process.arch}.node`;

const tries = [
    ...(process.platform === 'darwin' ? [
        [__dirname, '..', 'build', 'Debug', `vscode-escript-native.darwin-universal.node`],
        [__dirname, '..', 'build', 'Release', `vscode-escript-native.darwin-universal.node`],
    ] : []),
    [__dirname, '..', 'build', 'Debug', baseFilename],
    [__dirname, '..', 'build', 'Release', baseFilename],
].map(segment => resolve(...segment));

const filename = tries.find(filepath => existsSync(filepath));

/* istanbul ignore next */
if (!filename) {
    throw new Error(`Unable to locate ${baseFilename}`);
}

export const native = require(filename) as EscriptVscodeNative;
