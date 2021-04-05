import { resolve } from 'path';
import { promises, readFileSync } from 'fs';
import { native } from '../src/index';
import { F_OK } from 'constants';
import writeFile = promises.writeFile;
import access = promises.access;
const { LSPWorkspace, LSPDocument } = native;

const cfg = resolve(__dirname, 'ecompile.cfg');

beforeAll(async () => {
    try {
        await access(cfg, F_OK);
    } catch {
        const moduleDirectory = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');
        const polDirectory = resolve(__dirname, '..', 'polserver', 'testsuite', 'pol');
        const includeDirectory = resolve(polDirectory, 'scripts', 'include');
        const cfgText = `ModuleDirectory ${moduleDirectory}\nIncludeDirectory ${includeDirectory}\nPolScriptRoot ${polDirectory}\nPackageRoot ${polDirectory}\nDisplayWarnings 1\n`;
        try {
            await writeFile(cfg, cfgText, 'utf-8');
        } catch (e) {
            console.error(`Could not create ecompile.cfg: ${e?.message ?? e}`);
            throw e;
        }
    }
});

describe('vscode-escript-native LSPWorkspace', () => {
    it('Text changing POC', () => {
        const src = 'in-memory-file.src';
        // The SourceFileLoader callback, mocking the LSP TextDocuments utility
        // class
        let text: string;
        let calls = 0;
        const getContents = (pathname: string) => {
            if (pathname === src) {
                calls++;
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        // Constructed at LSP server initialization, pointing to the CFG (can be
        // found at extension load time)
        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        // Done at textDocument/didOpen
        const document = new LSPDocument(workspace, src);

        // Done at textDocument/didChange
        text = 'var hello := foobar;';
        document.analyze();
        let diagnostics = document.diagnostics();
        expect(diagnostics).toHaveLength(1); // unknown identifier

        // Replaced foobar with 0
        text = 'var hello := 0;';
        document.analyze();
        diagnostics = document.diagnostics();
        expect(diagnostics).toHaveLength(0); // no diagnostics

        expect(calls).toEqual(2);
    });

    it('Module compilation', () => {
        // The SourceFileLoader callback, mocking the LSP TextDocuments utility
        // class
        let text: string;
        let calls = 0;
        const getContents = (pathname: string) => {
            calls++;
            return text;
        };

        // Constructed at LSP server initialization, pointing to the CFG (can be
        // found at extension load time)
        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        // Done at textDocument/didOpen
        const pathname = 'basicio.em';
        const document = new LSPDocument(workspace, pathname);

        // Done at textDocument/didChange
        text = 'Print(anything);';
        document.analyze();
        let diagnostics = document.diagnostics();
        expect(diagnostics).toHaveLength(0); // okay

        // Replaced foobar with 0
        text = 'if (1) endif';
        document.analyze();
        diagnostics = document.diagnostics();
        expect(diagnostics).toHaveLength(1); // modules can't have statements

        expect(calls).toEqual(2);
    });

    it('Can get dependents', () => {
        const pathname = '/tmp/start.src';
        const incname = resolve(__dirname, '..', 'polserver', 'testsuite', 'pol', 'scripts', 'include', 'testutil.inc');

        const mocks = {
            [pathname]: 'include "testutil";',
            [incname]: 'Print(1);'
        };

        const getContents = (pathname: string) => {
            const text = mocks[pathname] ?? readFileSync(pathname, 'utf-8');
            return text;
        };

        const workspace = new LSPWorkspace({
            getContents
        });

        workspace.read(cfg);

        const document = new LSPDocument(workspace, pathname);

        document.analyze();
        const diagnostics = document.diagnostics();
        expect(diagnostics).toHaveLength(0); // okay

        const dependents = document.dependents();

        const moduleDirectory = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');
        const basicMod = resolve(moduleDirectory, 'basic.em');
        const basicioMod = resolve(moduleDirectory, 'basicio.em');

        expect(dependents).toEqual([
            pathname,
            basicMod,
            basicioMod,
            incname,
        ]);
    });
});
