import { existsSync, readFileSync, readdirSync } from 'fs';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { native } from '../../native/src/index';
const { LSPDocument, LSPWorkspace } = native;

const { __debug: { formatAST } } = require('prettier');

import * as util from 'util';
util.inspect.defaultOptions.depth = Infinity;

import { languages, parsers, printers } from '../src/prettier-plugin';
import { basename, dirname, extname, join, resolve } from 'path';
import { F_OK } from 'constants';

const plugin = {
    languages, parsers, printers
};

// const dir = resolve(__dirname);
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

describe('prettier-formatter', () => {
    test('foo', async () => {

        const testFormat = (srcname: string, text?: string) => {
            const dir = '/Users/kevineady/UO/ModernDistro/';

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



        const srcname = '/Users/kevineady/UO/ModernDistro/pkg/tools/bautool/commands/seer/bautool.src';
        // const srcname = '/Users/kevineady/UO/ModernDistro/scripts/modules/file.em';
        // const text = undefined;
        const text = `use basic;

        if (1)
            print( "hello world" );
        endif
        ;

        // note the semicolon up there, after the endif


        print( "hello world again" );
        `;
        // const text = `case (abc) 1: 2: 3: "body"; endcase`;

        const { ast, originalText } = testFormat(srcname, text);
        // console.log(ast);
        const { formatted } = await formatAST(ast, {
            parser: 'escript',
            plugins: [plugin],
            originalText
        });
        // console.log(formatted);
    });
});

describe('test all', () => {
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
                plugins: [plugin],
                text: this.text
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

    const extensions = ['.src', '.inc', '.em'];
    outer:
    for (const folder of ['escript', 'pol', join('..', 'pol-core', 'support', 'scripts')]) {
        const scriptsDir = resolve(__dirname, '..', '..', 'native', 'polserver', 'testsuite', folder);
        const files = readDirectoryRecursive(scriptsDir);

        for (const basefile of files) {
            if (basename(basefile).startsWith('.') || basefile.endsWith(join('native', 'polserver', 'testsuite', 'escript', 'func', 'func0ab.inc'))) {
                continue;
            }
            const extension = extname(basefile);
            if (extensions.indexOf(extension) === -1) { continue; }

            const file = resolve(scriptsDir, basefile);
            const errFile = join(dirname(file), basename(file, extension) + '.err');
            if (existsSync(errFile)) {
                continue;
            }
            it(`Processing ${file}`, async () => {
                const data = await readFile(file, 'utf-8');
                const doc = new DynamicDocument(file, data);
                expect(doc.ast).toBeTruthy();
            });
        }
    }
});
