import { resolve } from 'path';
import { native } from '../src/index';
const { LSPWorkspace, hello } = native;

describe('vscode-escript-native', () => {
    it('Diagnose POC', () => {
        const moduleDirectory = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');
        const contents = 'var hello := foobar;';

        const diagnostics = hello(moduleDirectory, contents);
        expect(diagnostics).toEqual([
            {
                range: {
                    start: { line: 1, character: 14 },
                    end: { line: 1, character: 14 }
                },
                severity: 1,
                message: 'Unknown identifier \'foobar\'.'
            }
        ]);
    });
});

describe('vscode-escript-native LSPWorkspace', () => {
    it('Text changing POC', () => {
        const cfg = resolve(__dirname, '..', 'polserver', 'testsuite', 'escript', 'ecompile.cfg');

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
            getContents,
            cfg
        });

        // Done at textDocument/didOpen
        const pathname = 'in-memory-file.src';
        workspace.open(pathname);

        // Done at textDocument/didChange
        text = 'var hello := foobar;';
        let diagnostics = workspace.diagnose(pathname);
        expect(diagnostics).toHaveLength(1); // unknown identifier

        // Replaced foobar with 0
        text = 'var hello := 0;';
        diagnostics = workspace.diagnose(pathname);
        expect(diagnostics).toHaveLength(0); // no diagnostics

        expect(calls).toEqual(2);

        workspace.close(pathname);
    });
});
