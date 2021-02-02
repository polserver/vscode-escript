import { dirname, join } from 'path';
import { promises } from 'fs';
import readFile = promises.readFile;
import access = promises.access;

/**
 * Workspace configuration object.
 */
type WorkspaceConfig = {
    polRoot: string;
    moduleDirectory: string;
    includeDirectory: string;
    polScriptRoot: string;
    /** May be zero-length */
    packageRoots: string[];
}

class CfgFileReader {
    /**
     * Returns a `Promise` that resolves to an object which represents the a
     * .cfg files contents:
     *   - the cfg file's keys are lowercased.
     *   - the values are all a `string[]`, to allow multiple values.
     * @param path File to load
     * @throws All `fs`-related exceptions
     * @throws `parseAsInner=false not yet supported
     */
    static async load(path: string, parseAsInner = false) {

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

class Workspace {
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
    private constructor(private config: WorkspaceConfig) {
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
                path = dirname(path);
                if (path === lastPath) {
                    break;
                }
                lastPath = path;

                try {
                // Check if ./pol.cfg exists. Is this needed...?
                    await access(join(path, 'pol.cfg'));

                    // Read ./scripts/ecompile.cfg
                    const cfg = await CfgFileReader.load(join(path, 'scripts', 'ecompile.cfg'), true);
                    const polRoot = path;
                    const moduleDirectory = cfg.moduledirectory?.[0];
                    const includeDirectory = cfg.includedirectory?.[0];
                    const polScriptRoot = cfg.polscriptroot?.[0];
                    const packageRoots = cfg.packageroot;

                    if (!moduleDirectory || !includeDirectory || !polScriptRoot) {
                        continue;
                    }

                    // Check the existence of these folders
                    await access(moduleDirectory);
                    await access(includeDirectory);
                    await access(polScriptRoot);

                    const config: WorkspaceConfig = {
                        polRoot,
                        includeDirectory,
                        moduleDirectory,
                        polScriptRoot,
                        packageRoots: []
                    };

                    // Package roots are technically optional for a `Workspace`.
                    if (packageRoots) {
                        for (const packageRoot of packageRoots) {
                            try {
                                await access(packageRoot);
                                config.packageRoots.push(packageRoot);
                            } catch {
                            // Ignore this PackageRoot
                            }
                        }
                    }

                    const workspace = new Workspace(config);
                    Workspace.workspaces.set(polRoot, workspace);
                    return workspace;
                } catch (e) {
                    continue;
                }
            }
        } catch {
            return undefined;
        }
    }
}

if (require.main === module) {
    void async function() {
        const p1 = Workspace.find('/Users/kevineady/UO/ModernDistroo/pkg/commands/gm/info.src');
        const p2 = Workspace.find('/Users/kevineady/UO/ModernDistro/pkg/commands/gm/test.src');
        const p3 = Workspace.find('/Users/kevineady/UO/ModernDistro/pkg/systems/accounts/start.src');
        const [w1, w2, w3] = await Promise.all([p1, p2, p3]);
        console.log(w1 === undefined);
        console.log(w2 === w3);
    }().catch(e => { console.log(e); process.exit(1); });
}