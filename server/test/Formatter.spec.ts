import { existsSync, readFileSync, readdirSync } from 'fs';
import { access, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { native } from '../../native/src/index';
import { platform } from 'os';
import EscriptPrettierPlugin, { EscriptPrettierPluginOptions } from '../src/prettier-plugin';
import { basename, dirname, extname, join, resolve, relative } from 'path';
import { F_OK } from 'constants';
import { spawn } from 'child_process';
import { inspect } from 'util';

const { LSPDocument, LSPWorkspace } = native;
const { __debug: { formatAST } } = require('prettier');

const describeLongTest = process.env['JEST_RUN_LONG_TESTS'] ? describe : describe.skip;

beforeAll(async () => {
    const cfg = resolve(__dirname, 'scripts', 'ecompile.cfg');
    try {
        await access(cfg, F_OK);
    } catch {
        const polDirectory = resolve(__dirname, '..', 'polserver', 'testsuite', 'pol');
        const includeDirectory = resolve(polDirectory, 'scripts', 'include');
        const moduleDirectory = resolve(polDirectory, 'scripts', 'modules');
        const cfgText = `ModuleDirectory ${moduleDirectory}\nIncludeDirectory ${includeDirectory}\nPolScriptRoot ${polDirectory}\nPackageRoot ${polDirectory}\nDisplayWarnings 1\n`;
        try {
            await mkdir(dirname(cfg), { recursive: true });
            await writeFile(cfg, cfgText, 'utf-8');
        } catch (e) {
            console.error(`Could not create ecompile.cfg: ${e instanceof Error ? e.message : e}`);
            throw e;
        }
    }
});

describe('Manual formatting test', () => {
    test('Test', async () => {

        const testFormat = (srcname: string, text?: string) => {
            const dir = __dirname;

            const originalText = text ?? readFileSync(srcname, 'utf-8');

            const getContents = (pathname: string) => {
                if (pathname === srcname) {
                    return originalText;
                }
                return readFileSync(pathname, 'utf-8');
            };

            const workspace = new LSPWorkspace({
                getContents
            });
            workspace.open(dir);

            const document = new LSPDocument(workspace, srcname);

            performance.mark('start');
            const ast = document.toAST();
            performance.mark('end');
            const measure = performance.measure('duration', 'start', 'end');
            performance.clearMarks('start');
            performance.clearMarks('end');
            performance.clearMeasures('duration');
            return { originalText, ast, measure };
        };

        // const srcname = '/Users/kevineady/UO/ModernDistro/scripts/test.src';
        const srcname = join(__dirname, 'scripts', 'test.src');

        // const text = `function foo(a,b,c) endfunction`;
        // const text = `if((critter.npctemplate)&&(critter.script!="tamed"))endif`;
        // const text = `((critter.npctemplate)&&(critter.script!="tamed"));`;
        const text = `if((who.x >= CInt(range[1])) && (who.x <= CInt(range[3])) && (who.y >= CInt(range[2])) && (who.y <= CInt(range[4]))) 1; endif`;
        // const text = `LogToFile(
        //     "::log/createstack_" + month + ".log",
        //     "On " + dmy + " at " + hms + " " + who.name + " on account " + who.acctname + " created  " + created.amount + " of " + GetObjTypeDesc(
        //       created.objtype,
        //       1
        //      )
        //    );`;
        //         const text = `
        // program purge(who)
        //   foreach critter in ListMobilesNearLocation( who.x, who.y, who.z, 20, who.realm )
        //     if ( ( critter.npctemplate ) && (critter.script != "tamed") )
        //       SetObjProperty( critter, "guardkill", 1 );
        //       KillMobile( critter );
        //     endif
        //   endforeach
        // endprogram`;
        // const text = `case (foo) 1: 2: nothing; 3:4:5: something; elsee; here; \n\ndefault: yahoo; endcase`;

        const { ast, originalText } = testFormat(srcname, text);

        // console.log(inspect(ast, undefined, Infinity));

        const { formatted } = await formatAST(ast, {
            parser: 'escript',
            plugins: [EscriptPrettierPlugin],
            originalText,
            conditionalParenthesisSpacing: true,
            bracketSpacing: true,
            emptyBracketSpacing: false,
            emptyParenthesisSpacing: false,
            otherParenthesisSpacing: true,
            printWidth: 100
        } as Partial<EscriptPrettierPluginOptions>);

        console.log(formatted);
        console.log(formatted.split(/\n/));
    });
});

describeLongTest('CompiledScript parity check', () => {
    class DynamicDocument {
        document: typeof LSPDocument;
        pathname: string;
        text: string;
        ast: Record<string, any>;

        constructor(pathname: string, text: string) {
            const dir = __dirname;
            this.pathname = pathname;
            this.text = text;
            const getContents = (pathname: string) => {
                if (pathname === this.pathname) {
                    return this.text;
                }
                return readFileSync(pathname, 'utf-8');
            };

            const workspace = new LSPWorkspace({
                getContents
            });
            workspace.open(dir);

            this.document = new LSPDocument(workspace, pathname);
            this.ast = this.document.toAST();
        }

        async formattedText(): Promise<string> {
            const { formatted } = await formatAST(this.ast, {
                parser: 'escript',
                plugins: [EscriptPrettierPlugin],
                originalText: this.text,
                conditionalParenthesisSpacing: true,
                bracketSpacing: true,
                emptyBracketSpacing: false,
                emptyParenthesisSpacing: false,
                otherParenthesisSpacing: true,
                printWidth: 100
            });
            return formatted;
        }
    }

    // Node 18.15.0 (which vscode uses as of 1.85.1) does not have the
    // `recursive` option for readdir, so must be implemented manually.
    const readDirectoryRecursive = (directory: string) => {
        try {
            let files = Array<string>();

            const entries = readdirSync(directory, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(directory, entry.name);

                if (entry.isDirectory()) {
                    const subdirectoryFiles = readDirectoryRecursive(fullPath);
                    files = files.concat(subdirectoryFiles);
                } else {
                    files.push(fullPath);
                }
            }

            return files;
        } catch (error) {
            throw error;
        }
    };

    const distroDir = process.env['JEST_POL_DISTRO_DIR'];
    if (!distroDir) {
        return;
    }

    const ecompileFile = resolve(distroDir, 'scripts', 'ecompile' + (platform() === 'win32' ? '.exe' : ''));

    const files = readDirectoryRecursive(distroDir);

    for (const existingSrcFile of files) {
        // if (existingSrcFile !== '/Users/kevineady/UO/ModernDistro/pkg/commands/seer/test.src') {
        //     continue;
        // }

        const extension = extname(existingSrcFile);

        if (extension !== '.src' || existingSrcFile.endsWith('.formatted.src')) {
            continue;
        }

        const basefile = join(dirname(existingSrcFile), basename(existingSrcFile, extension));

        const files = {
            'formatted.dbg': `${basefile}.formatted.dbg`,
            'formatted.dbg.txt': `${basefile}.formatted.dbg.txt`,
            'formatted.dep': `${basefile}.formatted.dep`,
            'formatted.ecl': `${basefile}.formatted.ecl`,
            'formatted.lst': `${basefile}.formatted.lst`,
            'formatted.src': `${basefile}.formatted.src`,
        };

        const existingEclFile = join(dirname(existingSrcFile), basename(existingSrcFile, extension) + '.ecl');

        if (!existsSync(existingEclFile)) {
            continue;
        }

        it(`Processing ${existingSrcFile}`, async () => {
            const data = await readFile(existingSrcFile, 'utf-8');

            if (data.trim() === '') {
                return;
            }

            const doc = new DynamicDocument(existingSrcFile, data);

            expect(doc.ast).toBeTruthy();

            const formatted = await doc.formattedText();

            expect(formatted).toBeTruthy();

            if (true as any) {
                await writeFile(existingSrcFile, formatted, 'utf-8');
                return;
            }

            await writeFile(files['formatted.src'], formatted, 'utf-8');

            const formattedSrcRelativeFile = relative(distroDir, files['formatted.src']);

            var success = false;

            try {
                const spawned = await new Promise<{ stderr: string, stdout: string, exitCode: number | null } | null>((resolve) => {
                    const proc = spawn(ecompileFile, ['-q', '-f', formattedSrcRelativeFile], {
                        cwd: distroDir
                    });

                    let stderr = '';
                    let stdout = '';

                    proc.stderr.on('data', (chunk) => {
                        stderr += chunk.toString();
                    });

                    proc.stdout.on('data', (chunk) => {
                        stdout += chunk.toString();
                    });

                    proc.on('error', () => {
                        resolve(null);
                    });

                    proc.on('exit', (exitCode) => {
                        resolve({ exitCode, stderr, stdout });
                    });
                });

                if (spawned === null) {
                    throw new Error('Run of ecompile errored.');
                }

                const { exitCode, stderr, stdout } = spawned;

                if (exitCode !== 0) {
                    throw new Error(`Error running ecompile, exitCode=${exitCode}, stderr=${stderr}, stdout=${stdout}`);
                }

                const originalCompiled = await readFile(existingEclFile);
                const formattedCompiled = await readFile(files['formatted.ecl']);

                if (!originalCompiled.equals(formattedCompiled)) {
                    throw new Error('Compiled source mismatch!');
                }

                success = true;
            } finally {
                for (const key in files) {
                    const toDelete = files[key as keyof typeof files];

                    if (!success && toDelete.endsWith('.src')) {
                        continue;
                    }
                    try {
                        const exists = await stat(toDelete);
                        if (exists) {
                            await unlink(toDelete);
                        }
                    } catch {
                        /* ignore */
                    }
                }
            }
        });
    }
});
