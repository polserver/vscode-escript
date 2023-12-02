import { resolve } from 'path';
import { promises, readFileSync } from 'fs';
import { LSPDocument, LSPWorkspace, native } from '../src/index';
import { F_OK } from 'constants';
import writeFile = promises.writeFile;
import access = promises.access;
const { LSPWorkspace, LSPDocument } = native;

const cfg = resolve(__dirname, 'ecompile.cfg');

function toBeDefined<T>(val: T): asserts val is NonNullable<T> {
    if (val === undefined) { throw new Error('Value is undefined'); }
}

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
            console.error(`Could not create ecompile.cfg: ${e instanceof Error ? e.message : e}`);
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
        const pathname = resolve('/tmp/start.src');
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

        expect(dependents.map(x => resolve(x))).toEqual([
            pathname,
            basicMod,
            basicioMod,
            incname,
        ]);
    });
});

describe('Hover - SRC', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getHover = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.hover({ line: 1, character });
    };

    it('Can hover constant', () => {
        const hover = getHover('const hello := 1;', 8);
        expect(hover).toEqual('(constant) hello := integer-value(1)');
    });

    it('Can hover variable', () => {
        const hover = getHover('var hello := 1;', 5);
        expect(hover).toEqual('(variable) hello');
    });

    it('Can hover user function declaration', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 11);
        expect(hover).toEqual('(user function) foo(bar, baz := integer-value(1))');
    });

    it('Can hover foreach (loop identifier)', () => {
        const hover = getHover('const bar := 5; foreach foo in bar endforeach', 33);
        expect(hover).toEqual('(constant) bar := integer-value(5)');
    });

    it('Can hover foreach (iterator identifier)', () => {
        const hover = getHover('foreach foo in (0) endforeach', 10);
        expect(hover).toEqual('(variable) foo');
    });

    it('Can hover enum declaration', () => {
        const hover = getHover('enum FOO BAR endenum', 11);
        expect(hover).toEqual('(constant) BAR := integer-value(0)');
    });

    it('Can hover switch label', () => {
        const hover = getHover('const foo := 5; case(5) foo: print(5); endcase', 26);
        expect(hover).toEqual('(constant) foo := integer-value(5)');
    });

    it('Can hover basic for', () => {
        const hover = getHover('for foo := 1 to 5 endfor', 6);
        expect(hover).toEqual('(variable) foo');
    });

    it('Can hover program declaration', () => {
        const hover = getHover('program foo(bar, baz) endprogram', 10);
        expect(hover).toEqual('(program) foo(bar, baz)');
    });

    it('Can hover program parameter', () => {
        const hover = getHover('program foo(bar, baz) endprogram', 14);
        expect(hover).toEqual('(program parameter) bar');
    });

    it('Can hover function parameter (no default)', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 14);
        expect(hover).toEqual('(parameter) bar');
    });

    it('Can hover function parameter (with default)', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 20);
        expect(hover).toEqual('(parameter) baz := integer-value(1)');
    });

    it('Can hover function reference', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction @Foo.call();', 42);
        expect(hover).toEqual('(user function) foo(bar, baz := integer-value(1))');
    });

    it('Can hover primary', () => {
        const hover = getHover('const foo := 5; foo;', 18);
        expect(hover).toEqual('(constant) foo := integer-value(5)');
    });

    it('Can hover navigation suffix', () => {
        const hover = getHover('var foo; foo.bar;', 15);
        expect(hover).toEqual('(member) bar');
    });

    it('Can hover method', () => {
        const hover = getHover('var foo; foo.bar();', 15);
        expect(hover).toEqual('(method) bar');
    });

    it('Can hover user function call', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction Foo(1);', 42);
        expect(hover).toEqual('(user function) foo(bar, baz := integer-value(1))');
    });

    it('Can hover module function call', () => {
        const hover = getHover('print(1);', 3);
        expect(hover).toEqual("(module function) Print(anything, console_color := string-value(\"\"))");
    });

    it('Can hover struct init member', () => {
        const hover = getHover('var foo := struct{ bar := 3 };', 20);
        expect(hover).toEqual('(member) bar');
    });
});

describe('Hover - Module', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.em';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getHover = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.hover({ line: 1, character });
    };

    it('Can hover module function declaration', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 9);
        expect(hover).toEqual('(module function) ModuleFunction(a, b := integer-value(5))');
    });

    it('Can hover module function parameter (no default)', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 19);
        expect(hover).toEqual('(parameter) b := integer-value(5)');
    });

    it('Can hover module function parameter (with default)', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 16);
        expect(hover).toEqual('(parameter) a');
    });
});


describe('Definition - SRC', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getDefinition = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.definition({ line: 1, character });
    };

    it('Can define variable', () => {
        const definition = getDefinition('var foo := struct{ bar := 3 }; foo;', 33);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 4 }, end: { line: 0, character: 29 } },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define constant', () => {
        const definition = getDefinition('const foo := 12345; foo;', 22);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 19 } },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define module function', () => {
        const definition = getDefinition('Print("foo");', 3);

        const moduleDirectory = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');
        const fsPath = resolve(moduleDirectory, 'basicio.em');
        if (definition) {
            definition.fsPath = resolve(definition.fsPath);
        }
        expect(definition).toEqual({
            range: { start: { line: 9, character: 0 }, end: { line: 9, character: 37 } },
            fsPath
        });
    });

    it('Can define user function', () => {
        const definition = getDefinition('function foo() endfunction foo();', 29);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 26 } },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define user function parameter', () => {
        const definition = getDefinition('function foo(bar) endfunction foo();', 15);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define program', () => {
        const definition = getDefinition('program foo(bar) endprogram', 10);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 27 } },
            fsPath: 'in-memory-file.src'
        });
    });
});

describe('Definition - Module', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.em';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getDefinition = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.definition({ line: 1, character });
    };

    it('Can define module function', () => {
        const definition = getDefinition('ModuleFunction(module_parameter := 1234);', 7);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 41 } },
            fsPath: 'in-memory-file.em'
        });
    });

    it('Can define module function parameter', () => {
        const definition = getDefinition('ModuleFunction(module_parameter := 1234);', 23);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 15 }, end: { line: 0, character: 39 } },
            fsPath: 'in-memory-file.em'
        });
    });

});

describe('Completion', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getCompletion = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.completion({ line: 1, character });
    };

    it('Can complete module functions', () => {
        const hover = getCompletion('use uo; ListItems;', 17);
        expect(hover).toEqual([
            { label: 'ListItemsAtLocation', kind: 3 },
            { label: 'ListItemsInBoxOfObjType', kind: 3 },
            { label: 'ListItemsNearLocation', kind: 3 },
            { label: 'ListItemsNearLocationOfType', kind: 3 },
            { label: 'ListItemsNearLocationWithFlag', kind: 3 }
        ]);
    });

    it('Can complete user functions', () => {
        const completion = getCompletion('function foobar() endfunction foob; foobar();', 34);
        expect(completion).toEqual([{ label: 'foobar', kind: 3 }]);
    });

    it('Can complete constants', () => {
        const completion = getCompletion('use uo; CRMULTI_;', 16);
        expect(completion).toEqual([
            { label: 'CRMULTI_FACING_EAST', kind: 21 },
            { label: 'CRMULTI_FACING_NORTH', kind: 21 },
            { label: 'CRMULTI_FACING_SOUTH', kind: 21 },
            { label: 'CRMULTI_FACING_WEST', kind: 21 },
            { label: 'CRMULTI_IGNORE_ALL', kind: 21 },
            { label: 'CRMULTI_IGNORE_MULTIS', kind: 21 },
            { label: 'CRMULTI_IGNORE_OBJECTS', kind: 21 },
            { label: 'CRMULTI_IGNORE_WORLDZ', kind: 21 }
        ]);
    });

    it('Can complete variables', () => {
        const completion = getCompletion('var varGlobal; program foo() var varLocal; va; endprogram', 45);
        expect(completion).toEqual([{ label: 'varLocal', kind: 6 }, { label: 'varGlobal', kind: 6 }]);
    });
});

describe('Signature Help', () => {
    let document: LSPDocument;
    let text: string;
    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return text;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.read(cfg);

        document = new LSPDocument(workspace, src);
    });

    const getSignatureHelp = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.signatureHelp({ line: 1, character });
    };

    it('Can signature help module functions', () => {
        const signatureHelp = getSignatureHelp('use uo; SendSysMessage();', 24);
        expect(signatureHelp).toEqual({
            'signatures': [{
                'label': 'SendSysMessage(character, text, font := integer-value(3), color := integer-value(1000))',
                'parameters': [
                    { 'label': [15, 24] },
                    { 'label': [26, 30] },
                    { 'label': [32, 36] },
                    { 'label': [58, 63] }]
            }],
            'activeSignature': 0,
            'activeParameter': 0
        });
    });

    it('Can signature help user functions', () => {
        const signatureHelp = getSignatureHelp('hello("foo", "bar"); function hello(unused foo, unused bar := 5) endfunction', 16);

        expect(signatureHelp).toEqual({
            'signatures': [{
                'label': 'hello(foo, bar := integer-value(5))',
                'parameters': [
                    { 'label': [6, 9] },
                    { 'label': [11, 14] }]
            }],
            'activeSignature': 0,
            'activeParameter': 1
        });
    });

    it('Can signature help nested function calls', () => {
        const where = [
            [ 12, 'Compare',  0 ],
            [ 21, 'Compare',  1 ],
            [ 33, 'Compare',  2 ],
            [ 42, 'SubStrReplace',  0 ],
            [ 50, 'SubStrReplace',  1 ],
            [ 57, 'SubStrReplace',  2 ],
            [ 63, 'Compare',  3 ],
            [ 69, 'Trim',  0 ],
            [ 76, 'Trim',  1 ]
        ] as const;

        for (const [character, expectedFunctionName, activeParameter ] of where) {
            const signatureHelp = getSignatureHelp('compare("hello", "there", substrreplace("abc", "def", 5123), trim("hello",0x03));', character);
            toBeDefined(signatureHelp);
            expect(signatureHelp.signatures).toHaveLength(1);
            const { label } = signatureHelp.signatures[0];
            const functionName = label.substr(0, label.indexOf('('));
            expect(signatureHelp.signatures).toHaveLength(1);
            expect(functionName).toEqual(expectedFunctionName);
            expect(signatureHelp.activeParameter).toEqual(activeParameter);
        }
    });
});
