import { resolve } from 'path';
import { promises, readFileSync } from 'fs';
import { native } from '../src/index';
import { F_OK } from 'constants';
import writeFile = promises.writeFile;
import access = promises.access;
const { LSPWorkspace } = native;

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
        const pathname = 'in-memory-file.src';
        workspace.open(pathname);

        // Done at textDocument/didChange
        text = 'var hello := foobar;';
        workspace.analyze(pathname);
        let diagnostics = workspace.diagnostics(pathname);
        expect(diagnostics).toHaveLength(1); // unknown identifier

        // Replaced foobar with 0
        text = 'var hello := 0;';
        workspace.analyze(pathname);
        diagnostics = workspace.diagnostics(pathname);
        expect(diagnostics).toHaveLength(0); // no diagnostics

        expect(calls).toEqual(2);

        workspace.close(pathname);
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
        workspace.open(pathname);

        // Done at textDocument/didChange
        text = 'Print(anything);';
        workspace.analyze(pathname);
        let diagnostics = workspace.diagnostics(pathname);
        expect(diagnostics).toHaveLength(0); // okay

        // Replaced foobar with 0
        text = 'if (1) endif';
        workspace.analyze(pathname);
        diagnostics = workspace.diagnostics(pathname);
        expect(diagnostics).toHaveLength(1); // modules can't have statements

        expect(calls).toEqual(2);

        workspace.close(pathname);
    });

    it('Can get dependees', () => {
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

        workspace.open(pathname);
        workspace.open(incname);

        workspace.analyze(pathname);
        const diagnostics = workspace.diagnostics(pathname);
        expect(diagnostics).toHaveLength(0); // okay

        const dependees = workspace.dependees(incname);
        expect(dependees).toEqual([pathname]);

        workspace.close(pathname);
        workspace.close(incname);
    });
});
