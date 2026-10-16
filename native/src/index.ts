import { resolve } from 'path';
import { existsSync } from 'fs';
import type { Diagnostic, Position, Range, CompletionItem, Location, FormattingOptions, DocumentSymbol } from 'vscode-languageserver-types';

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
    /**
     * Contents of an open document, or `undefined` when it is not open in an
     * editor -- in which case the addon reads the file itself. Returning the
     * file's contents from here anyway is still correct, just slower.
     */
    getContents: (pathname: string) => string | undefined;
    getXmlDocPath?: (moduleEmFile: string) => string | null;
}

/**
 * Counters collected by the compiler, cumulative for the life of the workspace.
 * Nothing resets them, so a caller measuring one operation must diff two
 * snapshots rather than read absolutes.
 *
 * `cacheHits`/`cacheMisses` and the `parse*Count` fields show whether include
 * files are being reused across analyses or reparsed every time. Now that
 * parsing is cached, the phases that still re-run on every analyze --
 * `optimizeMicros`, `analyzeMicros`, `tokenizeMicros` -- and the AST rebuild
 * that happens even on a cache hit (`ast*Micros`) are where the remaining time
 * goes.
 *
 * Two readings need care:
 *  - `astSrcMicros` and `astIncMicros` are decremented by nested include time,
 *    so they are self-time and can be transiently negative.
 *  - `ambiguities` counts ANTLR ambiguity reports. Each one means the SLL parse
 *    bailed and the file was re-parsed in full LL mode, roughly doubling its
 *    parse cost.
 */
export type CompilerProfile = {
    cacheHits: number;
    cacheMisses: number;
    ambiguities: number;
    parseEmCount: number;
    parseIncCount: number;
    parseSrcCount: number;
    buildWorkspaceMicros: number;
    registerConstDeclarationsMicros: number;
    optimizeMicros: number;
    disambiguateMicros: number;
    analyzeMicros: number;
    tokenizeMicros: number;
    codegenMicros: number;
    pruneCacheSelectMicros: number;
    pruneCacheDeleteMicros: number;
    loadEmMicros: number;
    parseEmMicros: number;
    astEmMicros: number;
    parseIncMicros: number;
    astIncMicros: number;
    parseSrcMicros: number;
    astSrcMicros: number;
    astResolveFunctionsMicros: number;
}

export interface LSPWorkspace {
    new(config: LSPWorkspaceConfig): LSPWorkspace;
    workspaceRoot: string;
    /** Snapshot of the compiler's counters. Read-only. */
    readonly profile: CompilerProfile;
    /**
     * Discards cached `.em`/`.inc` parse trees. Must be called whenever such a
     * file changes, since contents may come from an unsaved editor buffer.
     */
    clearParseTreeCache(): void;
    open(workspaceRoot: string): void;
    reopen(): boolean; // `true` if folder changes occurred in scripts/ecompile.cfg
    getConfigValue(key: 'PackageRoot'): Array<string>;
    getConfigValue(key: 'IncludeDirectory' | 'ModuleDirectory' | 'PolScriptRoot'): string;
	scripts: { inc: string[], src: string[] };
	autoCompiledScripts: readonly string[];
	getDocument(pathname: string): LSPDocument;
	updateCache: typeof updateCache;
	/**
	 * Drops the memoized workspace reference index so the next `updateCache()`
	 * rebuilds it instead of answering from the previous run. Call whenever
	 * `reopen()` reports configuration changes.
	 */
	invalidateReferenceCache(): void;
}

export interface LSPDocument {
    new(workspace: LSPWorkspace, pathname: string): LSPDocument;
    analyze(continueOnError?: boolean): void;
    /**
     * Frees this document's syntax tree and diagnostics, keeping the reference
     * index. Call when the editor closes the document; a later `analyze()`
     * restores it.
     */
    release(): void;
    dependents(): string[];
    diagnostics(): Diagnostic[];
    hover(position: Position): string | undefined;
    completion(position: Position): CompletionItem[];
    definition(position: Position, options?: { nameOnly?: boolean }): { range: Range, fsPath: string } | undefined;
    references(position: Position): { range: Range, fsPath: string }[] | undefined;
    signatureHelp(position: Position): SignatureHelp | undefined;
	toFormattedString(options?: Partial<Pick<FormattingOptions, 'tabSize'|'insertSpaces'>>, formatRange?: Range): string; // throws
    /**
     * Semantic tokens as a flat array of 5 values each -- line, startChar,
     * length, tokenType, tokenModifiers -- ordered by position.
     */
    tokens(): Uint32Array;
    toStringTree(): string | undefined;
    buildReferences(): undefined;
    references(position: Position): Location[] | undefined;
    symbols(): DocumentSymbol[] | undefined;
}

export interface ExtensionConfiguration {
    polCommitId: string;
    showModuleFunctionComments: boolean;
    continueAnalysisOnError: boolean;
	disableWorkspaceReferences: boolean;
	referenceAllFunctions: boolean;
}

export interface EscriptVscodeNative {
    LSPWorkspace: LSPWorkspace;
    LSPDocument: LSPDocument;
    ExtensionConfiguration: {
        setFromObject(settings: Partial<ExtensionConfiguration>): void
        get(setting: 'polCommitId'): string;
        get(setting: 'showModuleFunctionComments'): boolean;
        get(setting: 'continueAnalysisOnError'): boolean;
        get(setting: 'disableWorkspaceReferences'): boolean;
        get(setting: 'referenceAllFunctions'): boolean;
    }
}

const baseFilename = `vscode-escript-native.${process.platform}-${process.arch}.node`;

/**
 * Directories that may contain the `build/` tree holding the compiled addon.
 *
 * Unbundled -- tests, and the old extension layout -- this file runs from
 * `native/out`, so `build/` is one level up. Bundled it runs from the bundle's
 * own directory: `dist/` in the packaged extension, `server/out` if bundled in
 * place. Each is listed rather than derived, so a layout change fails loudly in
 * the error below instead of silently resolving to nothing.
 */
const roots = [
    resolve(__dirname, '..'),
    resolve(__dirname, '..', 'native'),
    resolve(__dirname, '..', '..', 'native')
];

const configurations = ['Debug', 'RelWithDebInfo', 'Release'];

const filenames = [
    ...(process.platform === 'darwin' ? ['vscode-escript-native.darwin-universal.node'] : []),
    baseFilename
];

const tries = roots.flatMap(root =>
    filenames.flatMap(name =>
        configurations.map(configuration => resolve(root, 'build', configuration, name))));

const filename = tries.find(filepath => existsSync(filepath));

/* istanbul ignore next */
if (!filename) {
    throw new Error(`Unable to locate ${baseFilename}, tried ${tries.join('; ')}`);
}

export type UpdateCacheProgressCallback = (progress: { count: number, total: number }) => void;
export const native = require(filename) as EscriptVscodeNative;
native.LSPWorkspace.prototype.updateCache = updateCache;
native.LSPWorkspace.prototype.invalidateReferenceCache = invalidateReferenceCache;

type UpdateCacheTask = {
    promise: Promise<boolean>;
    progresses: UpdateCacheProgressCallback[];
    signals: AbortSignal[];
};

const updateCacheMap = new WeakMap<LSPWorkspace, UpdateCacheTask>();

/**
 * How long the index build may hold the event loop before yielding, in
 * milliseconds.
 *
 * It used to yield once per file, so a 1240-script distribution spent 1240
 * macrotask turns purely to let a pending request through -- far more often than
 * a request actually arrives. A time budget keeps the server just as responsive
 * while paying the scheduler once per budget instead of once per file.
 */
const UPDATE_CACHE_YIELD_MS = 5;

/**
 * Discards the memoized reference-index build.
 *
 * A completed build deliberately leaves its entry in `updateCacheMap`: that is
 * what makes every later `textDocument/references` free rather than an N-file
 * recompile. But `reopen()` clears the native document cache when the
 * ecompile.cfg folders change, and the memo outlives it -- the caller then asks
 * for `updateCache()`, the already-resolved promise answers immediately, and the
 * index is silently never rebuilt for the new configuration.
 *
 * This cannot wrap `reopen()` itself: methods defined through N-API's
 * DefineClass land on the prototype as non-writable, so assigning over one
 * throws. `updateCache` gets away with it only because it is a new property.
 */
function invalidateReferenceCache(this: LSPWorkspace): void {
    updateCacheMap.delete(this);
}

function updateCache(this: LSPWorkspace, progress?: UpdateCacheProgressCallback, signal?: AbortSignal) {
    // Progress reporters and abort signals belong to the caller that supplied
    // them; once the build settles they are done with, and holding them would
    // pin the reporter objects for the life of the workspace.
    //
    // Scoped to the task that owns them: a task superseded by invalidation
    // settles *after* its replacement has already registered, and must not
    // clear the replacement's reporters on its way out.
    const settleFor = (owner: UpdateCacheTask) => (completed: boolean) => {
        if (updateCacheMap.get(this) === owner) {
            owner.progresses.length = 0;
            owner.signals.length = 0;
        }
        return completed;
    };

    const existing = updateCacheMap.get(this);
    if (existing) {
        if (progress) {
            existing.progresses.push(progress);
        }
        if (signal) {
            existing.signals.push(signal);
        }
        return existing.promise.then(settleFor(existing));
    }

    const update = async (): Promise<boolean> => {
        const { autoCompiledScripts } = this;
        let count = 0;
        const total = autoCompiledScripts.length;

        // Hand control back before the first compile, so this call returns to
        // its caller as promptly as it did when every file yielded.
        await new Promise(resolve => setImmediate(resolve));
        let lastYield = Date.now();

        for (const p of autoCompiledScripts) {
            if (Date.now() - lastYield >= UPDATE_CACHE_YIELD_MS) {
                await new Promise(resolve => setImmediate(resolve));
                lastYield = Date.now();
            }

            const current = updateCacheMap.get(this);

            // A reopen() with folder changes replaced or dropped this task. A
            // build started against the old configuration must not keep writing
            // into the new one.
            if (current !== task) {
                return false;
            }

            if (current.signals.some(aborter => aborter.aborted)) {
                // Drop the entry so a later updateCache() starts a fresh task.
                updateCacheMap.delete(this);
                return false;
            }

            try {
                this.getDocument(p).buildReferences();
            } catch (e) {
                console.error(`Failed to process ${p}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
            }

            ++count;
            current.progresses.forEach(report => report({ count, total }));
        }
        return true;
    };

    // Registered before the task starts: with a time budget the first files are
    // compiled before any yield, and the loop checks its own registration.
    const task: UpdateCacheTask = {
        promise: undefined as unknown as Promise<boolean>,
        progresses: progress ? [progress] : [],
        signals: signal ? [signal] : []
    };
    updateCacheMap.set(this, task);
    task.promise = update();

    return task.promise.then(settleFor(task));
}
