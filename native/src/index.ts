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
	scripts: { inc: string[], src: string[] };
	autoCompiledScripts: readonly string[];
	getDocument(pathname: string): LSPDocument;
	cacheScripts(...args: any[]): void;
	updateCache: typeof updateCache;
}

export interface LSPDocument {
    new(workspace: LSPWorkspace, pathname: string): LSPDocument;
    analyze(continueOnError?: boolean): void;
    dependents(): string[];
    diagnostics(): Diagnostic[];
    hover(position: Position): string | undefined;
    completion(position: Position): CompletionItem[];
    definition(position: Position, options?: { nameOnly?: boolean }): { range: Range, fsPath: string } | undefined;
    references(position: Position): { range: Range, fsPath: string }[] | undefined;
    signatureHelp(position: Position): SignatureHelp | undefined;
    tokens(): [line: number, startChar: number, length: number, tokenType: number, tokenModifiers: number][];
    toStringTree(): string | undefined;
    buildReferences(): undefined;
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
        [__dirname, '..', 'build', 'RelWithDebInfo', `vscode-escript-native.darwin-universal.node`],
        [__dirname, '..', 'build', 'Release', `vscode-escript-native.darwin-universal.node`],
    ] : []),
    [__dirname, '..', 'build', 'Debug', baseFilename],
    [__dirname, '..', 'build', 'RelWithDebInfo', baseFilename],
    [__dirname, '..', 'build', 'Release', baseFilename],
].map(segment => resolve(...segment));

const filename = tries.find(filepath => existsSync(filepath));

/* istanbul ignore next */
if (!filename) {
    throw new Error(`Unable to locate ${baseFilename}`);
}

export type UpdateCacheProgressCallback = (progress: { count: number, total: number }) => void;
export const native = require(filename) as EscriptVscodeNative;
native.LSPWorkspace.prototype.updateCache = updateCache;

const updateCacheMap = new WeakMap<LSPWorkspace, { promise: Promise<boolean>, progresses: UpdateCacheProgressCallback[], signals: AbortSignal[] }>();

function updateCache(this: LSPWorkspace, progress?: UpdateCacheProgressCallback, signal?: AbortSignal) {
	const existing = updateCacheMap.get(this);
	if (existing) {
		const { promise, progresses } = existing;
		if (progress) {
			progresses.push(progress);
		}
		return promise.then((completed) => {
			const existing = updateCacheMap.get(this);
			if (existing) {
				existing.progresses.length = 0;
				existing.signals.length = 0;
			}
			return completed;
		});
	}

	const update = async () => {
		const { autoCompiledScripts } = this;
		let count = 0;
		const total = autoCompiledScripts.length;
		for (const p of autoCompiledScripts) {
			await new Promise(resolve => setImmediate(resolve));
			const existing = updateCacheMap.get(this);
			const canceled = Boolean(existing?.signals.some(signal => signal.aborted));

			if (canceled) {
				return false;
			}

			try {
				this.getDocument(p).buildReferences();
			} catch (e) {
				// Should never happen
				console.error(`Failed to process ${p}: ${e}`);
			}

			++count;
			if (existing) {
				existing.progresses.forEach(progress => progress({ count, total }));
			}
		}
		return true;
	}
	const promise = update();
	updateCacheMap.set(this, { promise, progresses: progress ? [progress] : [], signals: signal ? [signal] : [] });

	return promise.then((completed) => {
		const existing = updateCacheMap.get(this);
		if (existing) {
			existing.progresses.length = 0;
			existing.signals.length = 0;
		}
		return completed;
	});
}
