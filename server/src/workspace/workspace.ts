import { dirname, join, resolve } from 'path';
import { promises } from 'fs';
import readFile = promises.readFile;
import access = promises.access;

/**
 * Workspace configuration object.
 */
type WorkspaceConfig = {
    readonly polRoot: string;
    readonly moduleDirectory: string;
    readonly includeDirectory: string;
    readonly polScriptRoot: string;
    /** May be zero-length */
    readonly packageRoots: ReadonlyArray<string>;
}

export class CfgFileReader {
    /**
     * Returns a `Promise` that resolves to an object which represents the a
     * .cfg files contents:
     *   - the cfg file's keys are lowercased.
     *   - the values are all a `string[]`, to allow multiple values.
     * @param path File to load
     * @throws All `fs`-related exceptions
     * @throws `parseAsInner=false not yet supported
     */
    static async load(path: string, parseAsInner: boolean) {

        const contents = await readFile(path, 'utf-8');
        if (parseAsInner) {
            // The return value
            const ret: { [key: string]: Array<string> | undefined } = {};

            for (const line of contents.split(/[\r\n]+/)) {
                // Skip comments
                if (line.startsWith('#')) {
                    continue;
                }
                const matches = line.match(/^([^=\s]+)\s*(?:=\s*)?(.+)$/);
                if (matches) {
                    const key = matches[1].toLowerCase();
                    const value = matches[2];
                    const existing = ret[key];
                    if (existing) {
                        existing.push(value);
                    } else {
                        ret[key] = [value];
                    }
                }
            }
            return ret;
        }
        throw new Error('parseAsInner=false not yet supported');
    }
}

export class Workspace {
    /**
     * Cache to hold workspaces. Key is the POL root, ie. `key ===
     * value.polRoot`
     */
    private static workspaces: Map<string, Workspace> = new Map();

    /**
     * Constructs a new `Workspace`. This method is private, as the public
     * interface is {@link `Workspace.find`}.
     * @param config Workspace configuration
     */
    private constructor(public readonly config: WorkspaceConfig) {
    }

    /**
     * Returns the number of `Workspace`s currently in the cache.
     */
    public static get count() {
        return this.workspaces.size;
    }

    /**
     * Returns a Workspace for a given script. Will return `undefined` if none
     * found. See internal implementation in {@link Workspace._find2}.
     * @param path Path of file (script, include, ...)
     */
    public static find(path: string) {
        return this.addTask(path);
    }


    /**
     * Task executor. Used to sequentialize calls to {@link Workspace._find2}
     */
    private static addTask = (() => {
        let pending = Promise.resolve<Workspace | undefined>(undefined);

        const run = async (path: string) => {
            try {
                await pending;
            } finally {
                return Workspace._find(path);
            }
        };

        // Update pending promise so that next task could await for it
        return (path: string) => (pending = run(path));
    })();

    /**
     * Returns a Workspace for a given script. Will return `undefined` if none
     * found.
     * @param path Path of file (script, include, ...)
     */
    static async _find(path: string): Promise<Workspace | undefined> {
        try {
            let lastPath = path;
            for (const [polRoot, workspace] of this.workspaces.entries()) {
                if (path.startsWith(polRoot)) {
                    return workspace;
                }
            }
            while (true) {
                try {
                // Check if ./pol.cfg exists. Is this needed...?
                    await access(join(path, 'pol.cfg'));

                    // Read ./scripts/ecompile.cfg
                    const cfg = await CfgFileReader.load(join(path, 'scripts', 'ecompile.cfg'), true);
                    const polRoot = resolve(path);
                    const moduleDirectory_ = cfg.moduledirectory?.[0];
                    const includeDirectory_ = cfg.includedirectory?.[0];
                    const polScriptRoot_ = cfg.polscriptroot?.[0];
                    const packageRoots_ = cfg.packageroot;

                    if (!moduleDirectory_ || !includeDirectory_ || !polScriptRoot_) {
                        continue;
                    }

                    const moduleDirectory = resolve(polRoot, moduleDirectory_);
                    const includeDirectory = resolve(polRoot, includeDirectory_);
                    const polScriptRoot = resolve(polRoot, polScriptRoot_);

                    const config: WorkspaceConfig = {
                        polRoot,
                        includeDirectory,
                        moduleDirectory,
                        polScriptRoot,
                        packageRoots: packageRoots_?.map(packageRoot => resolve(polRoot, packageRoot)) ?? []
                    };

                    const workspace = new Workspace(config);
                    Workspace.workspaces.set(polRoot, workspace);
                    return workspace;
                } catch { }
                path = dirname(path);
                if (path === lastPath) {
                    break;
                }
                lastPath = path;
            }
        } catch {
            return undefined;
        }
    }
    /**
     * Closes all cached `Workspace`s.
     */
    public static closeAll() {
        for (const [, workspace] of Workspace.workspaces) {
            workspace.close();
        }
    }

    /**
     * Close this `Workspace`.
     */
    public close() {
        Workspace.workspaces.delete(this.config.polRoot);
    }
}
