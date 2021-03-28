import { resolve } from 'path';
import { promises } from 'fs';
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
        console.log('creating', cfg);
        const moduleDirectory = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');

        const cfgText = `ModuleDirectory ${moduleDirectory}\nIncludeDirectory ${__dirname}\nPolScriptRoot ${__dirname}\nPackageRoot ${__dirname}\nDisplayWarnings 1\n`;
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
});
