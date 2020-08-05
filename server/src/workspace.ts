import { join, dirname, extname, resolve, basename } from 'path';
import { promises as fsp } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { CompletionItem, CompletionItemKind, FileChangeType } from 'vscode-languageserver';
import { ConfigParser } from './config-parser';
import { EscriptSymbolBuilder } from './parser';
import { Sym, MemberProperty, MethodProperty, ExportedProperty } from './semantics';
import * as doctrine from 'doctrine';
import { EventEmitter } from 'events';

type PackageMap = {
    [packageName: string]: PackageInfo
};

let count = 0;
type ModuleMap = {
    [moduleName: string]: string
};

type ObjTypeEntry = {
    type: string;
    name: string | undefined;
    casedName: string | undefined;
    pkgName: string;
    srcUri: string;
    cfgUri: string;
    methods: Sym[]
};

type PackageInfo = {
    uri: string;
    enabled: boolean;
    name: string;
    includes: string[];
}

export type EscriptWorkspacePathDetailsOpts = {
    types?: boolean; // default: false
    recurse?: boolean; // default: true
    isDir?: boolean; // default: false
    builder?: EscriptSymbolBuilder;
}

type ArrayDifferences<T> = {
    adds: T[];
    dels: T[];
    same: T[];
};
function differences<T>(old: Set<T>, now: Set<T>): ArrayDifferences<T> {
    const first = Array.from(now).reduce((p, c) => ((old.has(c) ? p.same.push(c) : p.adds.push(c)), p), { adds: [], dels: [], same: [] } as ArrayDifferences<T>);
    old.forEach(x => !now.has(x) && first.dels.push(x));
    return first;
}

type WorkspaceFinderRequest = {
    folder: string;
    recurse: boolean;
    cb: (workspace: EscriptWorkspacePathDetails | null) => any;
}
class WorkspaceFinder extends EventEmitter {

    private requests: WorkspaceFinderRequest[] = [];
    private processing: boolean = false;

    constructor(private map: WorkspaceCache) {
        super();
        this.on('request', this.request);
    }

    request = (request: WorkspaceFinderRequest) => {
        this.requests.push(request);
        if (!this.processing) {
            this.processing = true;
            this.newRequest().catch(/** @TODO proper error catcher */);
        }
        this.emit;
    }

    // emit(event: string | symbol, ...args: any[]): boolean;
    emit(event: 'request', request: WorkspaceFinderRequest): boolean;

    emit(event: string | symbol, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }

    findSync(uri: string, recurse = true) {
        let result: EscriptWorkspacePathDetails | null = null;
        let last: string;

        do {
            const existing = this.map.get(uri);
            if (existing) {
                result = existing;
            }
            last = uri;
            uri = dirname(uri);
        } while (!result && recurse && last !== uri);
        return result;
    }

    async newRequest() {
        let request: WorkspaceFinderRequest | undefined;
        let result: EscriptWorkspacePathDetails | null = null;
        while (request = this.requests.shift()) {
            let last: string;
            const { folder } = request;

            result = this.findSync(folder, request.recurse);
            if (!result) {
                let current = folder;
                do {
                    result = await WorkspaceFinder.tryFolder(current);
                    if (result) {
                        this.map.set(current, result);
                        break;
                    }
                    last = current;
                    current = dirname(current);
                } while (request.recurse && last !== current);
            }
            request.cb(result);
        }
        this.processing = false;
    }


    private static async tryFolder(path: string) {
        const ecompile = join(path, 'scripts', 'ecompile.cfg');
        let contents: string;
        try {
            contents = await fsp.readFile(ecompile, 'utf-8');
            // await new Promise(resolve => setTimeout(resolve, Math.random() * 10000));
            const result = new EscriptWorkspacePathDetails(pathToFileURL(path).toString());
            if (++count === 2) {
                debugger;
            }
            await result.processEcompileCfg(ecompile, contents);
            
            // result.root = 
            // const lines = contents.split(/[\r\n]+/);
            // for (const line of lines) {
            //     const matches = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]+)=(.+)/);
            //     if (matches) {
            //         const absPath = resolve(path, matches[2]);
            //         const uri = pathToFileURL(absPath).toString();
            //         try {
            //             if (!(await fsp.lstat(absPath)).isDirectory()) { continue; }
            //         } catch { continue; }
            //         switch (matches[1].toLowerCase()) {
            //         case 'packageroot':
            //             result.packageRoots.push(uri);
            //             break;
            //         case 'includedirectory':
            //             result.includeDirs.push(uri);
            //             break;
            //         case 'moduledirectory':
            //             result.moduleDir = uri;
            //             break;
            //         case 'polscriptroot':
            //             result.scriptRoot = uri;
            //             break;
            //         }
            //     }
            // }
            // if (result.moduleDir) {
            //     result.modules = await EscriptWorkspacePathDetails.getModules(result.moduleDir);
            // }
            // const dirs = [...result.packageRoots].map(x => fileURLToPath(x));
            // let dir: string;
            // while (dir = dirs.shift()!) {
            //     const files = (await fsp.readdir(dir, { withFileTypes: true }))
            //         .reduce((prev, cur) => {
            //             const { name } = cur;
            //             const full = join(dir, name);
            //             const uri = pathToFileURL(full).toString();
            //             if (name.toLowerCase() === 'pkg.cfg' && cur.isFile()) {
            //                 prev.pkg = full;
            //                 prev.uri = pathToFileURL(dir).toString();
            //             } else if (cur.isDirectory()) {
            //                 prev.dirs.push(full);
            //             }
            //             return prev;
            //         }, { pkg: undefined, dir: undefined, dirs: [] } as { pkg?: string, uri?: string, dirs: string[] });

            //     if (files.pkg && files.uri) {
            //         const cfg = (files.pkg);
            //         try {
            //             const contents = await fsp.readFile(cfg, 'utf-8');
            //             const lines = contents.split(/[\r\n]+/);
            //             let pkgInfo: PackageInfo = { name: '', enabled: false, uri: files.uri, includes: [] };
            //             for (const line of lines) {
            //                 const matches = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]+)\s+(.+)/);
            //                 if (matches) {
            //                     switch (matches[1].toLowerCase()) {
            //                     case 'enabled':
            //                         pkgInfo.enabled = matches[2] === '0' ? false : true;
            //                         break;
            //                     case 'name':
            //                         pkgInfo.name = matches[2];
            //                         break;
            //                     }
            //                 }
            //             }
            //             pkgInfo.includes = await EscriptWorkspacePathDetails.getPackages(dir);
            //             if (pkgInfo.name) {
            //                 result.packages[pkgInfo.name] = pkgInfo;
            //             }
            //         } catch (e) { console.error(e); }
            //     }
            //     dirs.push(...files.dirs);
            // }
            return result;
        } catch {
            /* Ignore error, maybe ecompile doesnt exist here */
        }
        return null;
    }

}

type WorkspaceRefreshHandler = () => any;
type WorkspaceCache = Map<string, EscriptWorkspacePathDetails>;
export class EscriptWorkspacePathDetails {

    private static nextId = 0;

    private readonly id = ++EscriptWorkspacePathDetails.nextId;
    public packageRoots: Set<string> = new Set();
    public includeDirs: Set<string> = new Set();
    public moduleDir?: string;
    public modules: ModuleMap = {};
    public scriptRoot?: string;
    public packages: PackageMap = {};
    public root: string;
    private static map: WorkspaceCache = new Map();
    private static finder: WorkspaceFinder = new WorkspaceFinder(EscriptWorkspacePathDetails.map);

    constructor(root: string) {
        this.root = root;
        this.log('Creating new workspace');
    }

    private get logId() {
        return `[WSP-${this.id.toString(16).padStart(4, '0')}-${this.root ?? '?'}]`;
    }
    public log(...args: any[]) {
        console.log.apply(console, ([this.logId]).concat(...args) as [any?, ...any[]] );
    }
    public error(...args: any[]) {
        console.error.apply(console, ([this.logId]).concat(...args) as [any?, ...any[]] );
    }

    async locateModule(module: string): Promise<string | undefined> {
        module = module.toLowerCase();
        return this.modules[module];
    }

    static reprocess(uri: string, change: FileChangeType) {
        const done = new Set<EscriptWorkspacePathDetails>();
        this.map.forEach(workspace => {
            if (!done.has(workspace)) {
                done.add(workspace);
            }
        });
    }

    private reprocess(uri: string, change: FileChangeType) {

    }

    public async processEcompileCfg(path: string, contents: string) {
        const packageRoots = new Set<string>();
        const includeDirs = new Set<string>();
        const rootPath = fileURLToPath(this.root);
        let moduleDir: string | undefined = undefined;
        let scriptRoot: string | undefined = undefined;
        const lines = contents.split(/[\r\n]+/);
        for (const line of lines) {
            const matches = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]+)=(.+)/);
            if (matches) {
                const absPath = resolve(rootPath, matches[2]);
                const uri = pathToFileURL(absPath).toString();
                try {
                    if (!(await fsp.lstat(absPath)).isDirectory()) { continue; }
                } catch { continue; }
                switch (matches[1].toLowerCase()) {
                case 'packageroot':
                    packageRoots.add(uri);
                    break;
                case 'includedirectory':
                    includeDirs.add(uri);
                    break;
                case 'moduledirectory':
                    moduleDir = uri;
                    break;
                case 'polscriptroot':
                    scriptRoot = uri;
                    break;
                }
            }
        }
        if (moduleDir && moduleDir !== this.moduleDir) {
            await this.getModules(moduleDir);
        }

        this.includeDirs = includeDirs;

        const { adds, dels } = differences(this.packageRoots, packageRoots);
        for (const add of adds) {
            await this.addPackageRoot(add);
        }
        for (const del of dels) {
            this.delPackageRoot(del);
        }
    }

    private delPackageRoot(del: any) {
        this.packageRoots.delete(del);

        const deletedPkgNames: string[] = [];
        for (const pkgName in this.packages) {
            const pkg = this.packages[pkgName];
            if (pkg.uri.startsWith(del)) {
                deletedPkgNames.push(pkgName);
                delete this.packages[pkgName];
            }
        }
        
        const { objtypes } = this;
        if (objtypes instanceof Map) {
            let needsReparse = false;
            objtypes.forEach((entry, id) => {
                if (deletedPkgNames.indexOf(entry.pkgName) > -1) {
                    objtypes.delete(id);
                    needsReparse = true;
                }
            });
            if (needsReparse) {
                this.builders.forEach(builder => builder.workspaceUpdated());
            }
        }
    }
    private async addPackageRoot(uri: string) {
        this.packageRoots.add(uri);
        const dirs = [ fileURLToPath(uri) ];
        let dir: string;
        while (dir = dirs.shift()!) {
            const files = (await fsp.readdir(dir, { withFileTypes: true }))
                .reduce((prev, cur) => {
                    const { name } = cur;
                    const full = join(dir, name);
                    if (name.toLowerCase() === 'pkg.cfg' && cur.isFile()) {
                        prev.pkg = full;
                        prev.uri = pathToFileURL(dir).toString();
                    } else if (cur.isDirectory()) {
                        prev.dirs.push(full);
                    }
                    return prev;
                }, { pkg: undefined, dir: undefined, dirs: [] } as { pkg?: string, uri?: string, dirs: string[] });

            if (files.pkg && files.uri) {
                try {
                    const contents = await fsp.readFile(files.pkg, 'utf-8');
                    await this.addPackage(files.uri, contents);
                } catch (e) { console.error(e); }
            }
            dirs.push(...files.dirs);
        }
    }

    private async addPackage(uri: string, contents: string) {
        const path = fileURLToPath(uri);
        const lines = contents.split(/[\r\n]+/);
        let pkgInfo: PackageInfo = { name: '', enabled: false, uri, includes: [] };
        for (const line of lines) {
            const matches = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]+)\s+(.+)/);
            if (matches) {
                switch (matches[1].toLowerCase()) {
                case 'enabled':
                    pkgInfo.enabled = matches[2] === '0' ? false : true;
                    break;
                case 'name':
                    pkgInfo.name = matches[2];
                    break;
                }
            }
        }
        pkgInfo.includes = await this.getIncludes(pkgInfo);
        if (pkgInfo.name) {
            this.packages[pkgInfo.name] = pkgInfo;
        }
    }


    public async getModules(moduleDir: string) {
        this.moduleDir = moduleDir;
        try {
            const moduleDir = fileURLToPath(this.moduleDir);
            const files = await fsp.readdir(moduleDir, { withFileTypes: true });
            this.modules = {} as ModuleMap;

            for (const file of files) {
                if (file.isFile() && file.name.endsWith('.em')) {
                    this.modules[basename(file.name, extname(file.name)).toLowerCase()] = pathToFileURL(join(moduleDir, file.name)).toString();
                }
            }
        } catch (e) { console.error(e); throw e; /* ignore */ }
    }

    private async getIncludes(pkgInfo: PackageInfo) {
        const pkgDir = fileURLToPath(pkgInfo.uri);
        const includes: string[] = [];

        const locs = ['.', './include'];
        while (locs.length) {
            const cur = join(pkgDir, locs.shift()!);
            try {
                const files = await fsp.readdir(cur, { withFileTypes: true });
                for (const file of files) {
                    const full = join(cur, file.name);
                    if (file.isDirectory()) {
                        locs.push(full);
                    }


                    if (extname(file.name).toLowerCase() === '.inc') {
                        // console.log(full);
                        includes.push(full.substr(pkgDir.length));
                    }
                }
            } catch { /* ignore */ }
        }
        return includes;
    }

    async locateInclude(includeSpec: string) {
        let roots: string[] = Array.from(this.includeDirs);
        if (includeSpec.startsWith(':')) {
            const lastColon = includeSpec.indexOf(':', 1);
            if (lastColon > -1) {
                const pkgName = includeSpec.substring(1, lastColon).toLowerCase();
                includeSpec = includeSpec.substr(lastColon + 1);
                const pkg = this.packages[pkgName];
                if (pkg) {
                    roots = [pkg.uri];
                } else {
                    this.error(`Could not find package`, pkgName);
                    return undefined;
                }
            }
        }

        const locs = ['.', './include'];

        if (extname(includeSpec).toLowerCase() !== '.inc') {
            includeSpec += '.inc';
        }

        for (const dir of roots) {
            for (const loc of locs) {
                try {
                    /** @TODO uri to filepath */
                    const filename = fileURLToPath(join(dir, loc, includeSpec));
                    if ((await fsp.stat(filename)).isFile()) {
                        return pathToFileURL(filename).toString();
                    }
                    else {
                        break;
                    }
                } catch { }
            }
        }
    }

    /**
     * Should only be used with full source uri (ie. NOT a directory)
     * @param uri Source uri, NOT a directory
     * @param opts Options
     */
    static findSync(uri: string, opts?: EscriptWorkspacePathDetailsOpts) {

        const file = dirname(fileURLToPath(uri));
        const workspace = this.finder.findSync(file, opts?.recurse ?? true);
        if (workspace && opts?.builder) {
            workspace.addBuilder(opts.builder);
        }
        return workspace;
    }

    static async find(uri: string, opts?: EscriptWorkspacePathDetailsOpts): Promise<EscriptWorkspacePathDetails | null> {
        let first: string;
        try {
            const file = fileURLToPath(uri);
            if ((await fsp.lstat(file)).isFile()) {
                first = dirname(file);
            } else {
                first = file.replace(/\/+$/,'');
            }
        } catch {
            this.map.delete(uri);
            return null;
        }
        return this.queueFindRequest(first, opts);
    }

    private static queueFindRequest(folder: string, opts?: EscriptWorkspacePathDetailsOpts): Promise<null | EscriptWorkspacePathDetails> {
        return new Promise(resolve => {
            const cb = (workspace: EscriptWorkspacePathDetails | null) => {
                if (workspace) {
                    this.map.set(folder, workspace);
                    if (opts?.builder) {
                        workspace.addBuilder(opts.builder);
                    }
                    if (opts?.types) {
                        const initTypes = workspace.initFindTypes();
                        if (initTypes) {
                            initTypes
                                .then(() => {
                                    workspace.builders.forEach(builder => {
                                        builder.invalidate(builder.exportsOnly);
                                    });
                                })
                                .catch(/** @TODO proper catch */);
                        }
                    }
                    resolve(workspace);

                } else {
                    this.map.delete(folder);
                }

            };
            this.finder.emit('request', {
                cb,
                folder,
                recurse: opts?.recurse ?? true
            });
        });
    }

    private builders: Set<EscriptSymbolBuilder> = new Set();

    addBuilder(builder: EscriptSymbolBuilder) {
        this.builders.add(builder);
    }

    removeBuilder(builder: EscriptSymbolBuilder) {
        this.builders.delete(builder);
    }

    private objtypes?: Map<number, ObjTypeEntry> | Promise<Map<number, ObjTypeEntry>>;

    public async waitForTypes() {
        if (!this.objtypes) {
            await this.initFindTypes();
        } else {
            await this.objtypes;
        }
    }

    public findMethods(objectName: string, application: string | number | undefined): ExportedProperty[] {
        const methods: ExportedProperty[] = [];
        if (this.objtypes instanceof Map) {
            if (typeof application === 'number') {
                const entry = this.objtypes.get(application);
                if (entry && (
                    (objectName === '*') ||
                    (objectName === entry.type)
                )) {
                    for (const method of entry.methods) {
                        const impl = entry.type + (entry.name ? `<"${entry.casedName}">` : `<0x${application.toString(16)}>`);
                        methods.push({
                            type: 'exported',
                            name: method.getCasedName(),
                            impl,
                            sym: method
                        });
                    }
                }
            } else {
                for (const [id, entry] of this.objtypes) {
                    // if (entry
                    if ((application === undefined || entry.name === application) && (
                        (objectName === '*') ||
                        (objectName === entry.type)
                    )) {
                        for (const method of entry.methods) {
                            const impl = entry.type + (entry.name ? `<"${entry.name}">` : `<0x${id.toString(16)}>`);
                            methods.push({
                                type: 'exported',
                                name: method.getCasedName(),
                                impl,
                                sym: method
                            });
                        }
                    }
                }
            }
        }
        return methods;
    }

    public resolveType(type: doctrine.Type): doctrine.Type {
        if (type.type === 'TypeApplication') {
            const { expression: expr, applications: apps } = type;
            if (expr.type === 'NameExpression' && apps.length) {
                const name = expr.name.toLowerCase();
                const app = apps[0];
                const target = name === 'objectof' ? '*' : name === 'npcof' ? 'npc' : name === 'itemof' ? 'item' : undefined;
                if (target) {
                    let found: [number, ObjTypeEntry] | undefined = undefined;
                    if (name === 'objectof' || name === 'npcof' || name === 'itemof') {
                        if (app.type === 'StringLiteralType') {
                            if (this.objtypes instanceof Map) {
                                for (const [id, entry] of this.objtypes) {
                                    // if (entry
                                    if (entry.name === app.value && (
                                        (target === '*') ||
                                        (target === 'npc' && entry.type === 'NPC') ||
                                        (target === 'item' && entry.type.match(/Item|Container|Spellbook|Door|House|Boat|Map|Weapon|Armor/))
                                    )) {
                                        found = [id, entry];
                                        break;
                                    }
                                }
                            } else {
                                switch (target) {
                                case '*': return { type: 'AllLiteral' };
                                case 'item': return { type: 'NameExpression', name: 'Item' };
                                case 'npc': return { type: 'NameExpression', name: 'NPC' };
                                }
                            }
                        } else if (app.type === 'NumericLiteralType') {
                            if (this.objtypes instanceof Map) {
                                const entry = this.objtypes.get(app.value);
                                if (entry && (
                                    (target === '*') ||
                                    (target === 'npc' && entry.type === 'NPC') ||
                                    (target === 'item' && entry.type.match(/Item|Container|Spellbook|Door|House|Boat|Map|Weapon|Armor/))
                                )) {
                                    found = [app.value, entry];
                                }
                            } else {
                                switch (target) {
                                case '*': return { type: 'AllLiteral' };
                                case 'item': return { type: 'NameExpression', name: 'Item' };
                                case 'npc': return { type: 'NameExpression', name: 'NPC' };
                                }
                            }
                        }
                    }
                    if (found) {
                        const x: doctrine.type.TypeApplication = {
                            type: 'TypeApplication',
                            expression: {
                                type: 'NameExpression',
                                name: found[1].type
                            },
                            applications: [
                                {
                                    type: 'NumericLiteralType',
                                    value: found[0]
                                }
                            ]
                        };
                        return x;
                    }
                }
            }
            return {
                type: 'AllLiteral'
            };
        }
        return type;
    }

    private refreshObjtype(objtype: number, entry: Omit<ObjTypeEntry, 'methods'>) {
        const objtypes = this.objtypes;
        if (objtypes instanceof Map) {
            const { type, cfgUri, srcUri, name, pkgName } = entry;
            objtypes.delete(objtype);
            EscriptSymbolBuilder.create(srcUri, { exportsOnly: true }).then(builder => {
                if (builder instanceof EscriptSymbolBuilder) {
                    const methods = builder.getExportedFunctions();
                    if (methods) {
                        objtypes.set(objtype, {
                            type,
                            pkgName,
                            cfgUri,
                            srcUri,
                            name: name?.toLowerCase(),
                            casedName: name,
                            methods
                        });
                    }
                }
            }).catch( /** @TODO handle proper catch */);
        }
    }

    private refreshQueue?: [number, ObjTypeEntry][];

    public invalidate(builder: EscriptSymbolBuilder, close: boolean) {
        // this.builders = this.builders
        const uri = builder.getUri();
        this.builders.delete(builder);
        if (!close) {
            this.log('Invalidating with refresh', uri);
            if (this.objtypes instanceof Map) {
                const refreshes: [number, ObjTypeEntry][] = [];
                const ext = extname(uri).toLowerCase();
                if (ext === '.src') {
                    for (const [id, entry] of this.objtypes) {
                        if (entry.srcUri === uri) {
                            refreshes.push([id, entry]);
                            // this.refreshObjtype(id, entry);
                        }
                    }
                } else if (ext === '.pkg') {
                    for (const [id, entry] of this.objtypes) {
                        if (entry.cfgUri === uri) {
                            refreshes.push([id, entry]);
                            // this.refreshObjtype(id, entry);
                        }
                    }
                }

                if (this.refreshQueue) {
                    this.refreshQueue.push(...refreshes);
                } else {
                    this.refreshQueue = refreshes;
                    process.nextTick(() => {
                        const queue = this.refreshQueue;
                        this.refreshQueue = undefined;
                        if (queue) {
                            queue.forEach(refresh => this.refreshObjtype(refresh[0], refresh[1]));
                        }
                    });
                }
            }
        }
    }

    public initFindTypes() {
        if (0 || this.objtypes) { return false; }
        return this.objtypes = new Promise(resolve => {
            const objtypes: Map<number, ObjTypeEntry> = new Map();
            const start = Date.now();
            // debugger;
            const entries = Object.entries(this.packages);
            const doOne = (entry: [string, PackageInfo] | undefined) => {
                if (entry) {
                    const [, pkgInfo] = entry;
                    const uri = pkgInfo.uri;
                    const pkgDir = fileURLToPath(uri);
                    const cfgFile = join(pkgDir, 'config', 'itemdesc.cfg');
                    fsp.readFile(cfgFile, 'utf-8')
                        .then(itemdesc => {
                            const cfg = new ConfigParser(itemdesc).parse();
                            for (const entry of cfg.entries) {
                                const typeName = (() => {
                                    switch (entry.type) {
                                    case 'NPCTEMPLATE': return 'NPC';
                                    case 'ITEM': return 'Item';
                                    case 'CONTAINER': return 'Container';
                                    case 'SPELLBOOK': return 'Spellbook';
                                    case 'DOOR': return 'Door';
                                    case 'HOUSE': return 'House';
                                    case 'BOAT': return 'Boat';
                                    case 'MAP': return 'Map';
                                    case 'WEAPON': return 'Weapon';
                                    case 'ARMOR': return 'Armor';
                                    }
                                })();
                                if (typeName) {
                                    const { METHODSCRIPT: methodScripts, NAME: name } = entry.properties;
                                    if (typeof entry.key === 'number') {
                                        const methodScript = methodScripts?.[0];
                                        let file = '';
                                        if (methodScript) {
                                            const lastColon = methodScript.indexOf(':', 1);
                                            if (methodScript.startsWith(':') && lastColon > -1) {
                                                const pkgFile = methodScript.substring(lastColon + 1);
                                                const pkgName = methodScript.substring(1, lastColon).toLowerCase();
                                                const pkgRoot = this.packages[pkgName]?.uri;
                                                if (pkgRoot) {
                                                    const pkgDir = fileURLToPath(pkgRoot);
                                                    file = join(pkgDir, pkgFile);
                                                }
                                            } else {
                                                file = join(pkgDir, methodScript);
                                            }
                                            if (file) {

                                                if (file.match(/\.ecl$/)) {
                                                    file = file.substring(0, file.length - 4) + '.src';
                                                } else if (!file.match(/\.src$/)) {
                                                    file += '.src';
                                                }
                                                const srcUri = pathToFileURL(file).toString();
                                                EscriptSymbolBuilder.create(srcUri, { exportsOnly: true }).then(builder => {
                                                    if (builder instanceof EscriptSymbolBuilder) {
                                                        const methods = builder.getExportedFunctions();
                                                        if (methods && typeof entry.key === 'number') {
                                                            objtypes.set(entry.key, {
                                                                type: typeName,
                                                                pkgName: pkgInfo.name,
                                                                cfgUri: pathToFileURL(cfgFile).toString(),
                                                                srcUri,
                                                                name: name?.[0]?.toLowerCase(),
                                                                casedName: name?.[0],
                                                                methods
                                                            });
                                                        }
                                                    }
                                                }).catch(/** @TODO proper catch */);
                                            }
                                        }
                                    }
                                }
                            }
                        })
                        .catch(() => { /* ignore */ })
                        .finally(() => { doOne(entries.shift()); });
                } else {
                    const now = Date.now();
                    this.log(`Finished processing exported functions in ${now - start}ms`);
                    resolve(this.objtypes = objtypes);
                }
            };
            doOne(entries.shift());
        });
    }

    public toCompletionItems(prefix: string): CompletionItem[] {
        const results: CompletionItem[] = [];
        prefix = prefix.toLowerCase();
        let file = '';
        if (prefix.startsWith(':')) {
            let lastColon = prefix.indexOf(':', 1);
            if (lastColon === -1) {
                lastColon = prefix.length;
            } else {
                file = prefix.substring(lastColon + 1);
            }
            const pkgName = prefix.substring(1, lastColon);
            this.log('Look for', pkgName, file);
            // if (pkgName)//
            for (const availPkgName in this.packages) {
                if (availPkgName.toLowerCase().startsWith(pkgName)) {
                    // console.log('look into',availPkgName, availPkgName.toLowerCase().startsWith(pkgName));
                    for (const include of this.packages[availPkgName].includes) {
                        if (include.startsWith(file)) {
                            results.push({
                                label: `${availPkgName}:${include.startsWith('/include') ? include.substring(9, include.length - 4) : include.substring(0, include.length - 4)}`,
                                kind: CompletionItemKind.File,
                                detail: 'This is the detail',
                                documentation: 'This is the documentation'
                            });
                        }
                    }
                }
            }
        }
        return results;
    }
}

(globalThis as any).EscriptWorkspacePathDetails = EscriptWorkspacePathDetails;
