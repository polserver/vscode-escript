import { basename, extname, resolve } from 'path';
import { readFileSync, readdirSync } from 'fs';
import { LSPDocument, LSPWorkspace, native } from '../src/index';
import { inspect } from 'util';
import { F_OK } from 'constants';
import { writeFile, access, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import type { Range, Position } from 'vscode-languageclient/node';

const { LSPWorkspace, LSPDocument, ExtensionConfiguration } = native;

const describeLongTest = process.env['JEST_RUN_LONG_TESTS'] ? describe : describe.skip;

const dir = resolve(__dirname);

// Uses relative path
const moduleDirectory = join('..', 'polserver', 'pol-core', 'support', 'scripts');
const moduleDirectoryAbs = resolve(__dirname, '..', 'polserver', 'pol-core', 'support', 'scripts');
const polDirectory = resolve(__dirname, '..', 'polserver', 'testsuite', 'pol');
const includeDirectory = resolve(polDirectory, 'scripts', 'include');

function toBeDefined<T>(val: T, message = 'Value is undefined'): asserts val is NonNullable<T> {
    if (val === undefined) { throw new Error(message); }
}

const escriptdoc = (text: string) => "```escriptdoc\n" + text + "\n```";

const xmlDocDir = resolve(__dirname, '..', 'polserver', 'docs', 'docs.polserver.com', 'pol100');

const classes_src = `class bar()
  var other;
  function bar( this, other := 5 )
    this.funcexpr := @( foo123 ) { print( foo123 ); };
    bar::other := other;
  endfunction
endclass

class FOO( bar )
  function foo( this )
    SUPER();
  endfunction

  function method_func( this, what := "everything" )
    basicio::print( $"{this} attacks {what}!" );
  endfunction

  function static_func( what := "everything" )
    print( $"static method {what}" );
  endfunction
endclass

var bar;
bar := FOO::foo();
bar := foo();

FOO::method_func( bar );
FOO::static_func( "what" );
`;

beforeAll(async () => {
    const cfg = resolve(dir, 'scripts', 'ecompile.cfg');
    try {
        await access(cfg, F_OK);
    } catch {
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
        workspace.open(dir);

        const document = workspace.getDocument(src);

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
        workspace.open(dir);

        const pathname = 'basicio.em';
        const document = workspace.getDocument(pathname);

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

        workspace.open(dir);

        const document = workspace.getDocument(pathname);

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

    it('Can use relative paths', () => {
        const workspace = new LSPWorkspace({
            getContents: () => ''
        });
        workspace.open(dir);
        expect(resolve(workspace.getConfigValue('ModuleDirectory'))).toEqual(resolve(dir, moduleDirectory));
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
        workspace.open(dir);

        document = workspace.getDocument(src);
    });

    const getHover = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.hover({ line: 1, character });
    };

    it('Can hover constant', () => {
        const hover = getHover('const hello := 1;', 8);
        expect(hover).toEqual(escriptdoc('(constant) hello := 1'))
    });

    it('Can hover variable', () => {
        const hover = getHover('var hello := 1;', 5);
        expect(hover).toEqual(escriptdoc('(variable) hello'))
    });

    it('Can hover user function declaration', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 11);
        expect(hover).toEqual(escriptdoc('(user function) foo( bar, baz := 1 )'))
    });

    it('Can hover foreach (loop identifier)', () => {
        const hover = getHover('const bar := 5; foreach foo in bar endforeach', 33);
        expect(hover).toEqual(escriptdoc('(constant) bar := 5'))
    });

    it('Can hover foreach (iterator identifier)', () => {
        const hover = getHover('foreach foo in (0) endforeach', 10);
        expect(hover).toEqual(escriptdoc('(variable) foo'))
    });

    it('Can hover enum declaration', () => {
        const hover = getHover('enum FOO BAR endenum', 11);
        expect(hover).toEqual(escriptdoc('(constant) BAR := 0'))
    });

    it('Can hover switch label', () => {
        const hover = getHover('const foo := 5; case(5) foo: print(5); endcase', 26);
        expect(hover).toEqual(escriptdoc('(constant) foo := 5'))
    });

    it('Can hover basic for', () => {
        const hover = getHover('for foo := 1 to 5 endfor', 6);
        expect(hover).toEqual(escriptdoc('(variable) foo'))
    });

    it('Can hover program declaration', () => {
        const hover = getHover('program foo(bar, baz) endprogram', 10);
        expect(hover).toEqual(escriptdoc('(program) foo( bar, baz )'))
    });

    it('Can hover program parameter', () => {
        const hover = getHover('program foo(bar, baz) endprogram', 14);
        expect(hover).toEqual(escriptdoc('(program parameter) bar'))
    });

    it('Can hover function parameter (no default)', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 14);
        expect(hover).toEqual(escriptdoc('(parameter) bar'))
    });

    it('Can hover function parameter (with default)', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction foo(0);', 20);
        expect(hover).toEqual(escriptdoc('(parameter) baz := 1'))
    });

    it('Can hover function reference', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction @Foo.call();', 42);
        expect(hover).toEqual(escriptdoc('(user function) foo( bar, baz := 1 )'))
    });

    it('Can hover primary', () => {
        const hover = getHover('const foo := 5; foo;', 18);
        expect(hover).toEqual(escriptdoc('(constant) foo := 5'))
    });

    it('Can hover navigation suffix', () => {
        const hover = getHover('var foo; foo.bar;', 15);
        expect(hover).toEqual(escriptdoc('(member) bar'))
    });

    it('Can hover method', () => {
        const hover = getHover('var foo; foo.bar();', 15);
        expect(hover).toEqual(escriptdoc('(method) bar'))
    });

    it('Can hover user function call', () => {
        const hover = getHover('function foo(bar, baz := 1) endfunction Foo(1);', 42);
        expect(hover).toEqual(escriptdoc('(user function) foo( bar, baz := 1 )'))
    });

    it('Can hover module function call', () => {
        const hover = getHover('print(1);', 3);
        expect(hover).toEqual(escriptdoc("(module function) Print( anything, console_color := \"\" )"))
    });

    it('Can hover struct init member', () => {
        const hover = getHover('var foo := struct{ bar := 3 };', 20);
        expect(hover).toEqual(escriptdoc('(member) bar'))
    });
});

describe('Hover - Classes', () => {
    let document: LSPDocument;

    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return classes_src;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.open(dir);

        document = workspace.getDocument(src);
    });

    const getHover = (line: number, character: number) => {
        document.analyze();
        return document.hover({ line, character });
    };

    it('Can hover class name in class declaration', () => {
        const hover = getHover(1, 8);
        expect(hover).toEqual(escriptdoc('(class) bar'))
    });

    it('Can hover class name in class parameter list', () => {
        const hover = getHover(9, 14);
        expect(hover).toEqual(escriptdoc('(class) bar'))
    });

    it('Can hover module name in scoped function call', () => {
        const hover = getHover(15, 9);
        expect(hover).toEqual(escriptdoc('(module) basicio'))
    });

    it('Can hover variable name in class body', () => {
        const hover = getHover(2, 10);
        expect(hover).toEqual(escriptdoc('(variable) bar::other'))
    });

    it('Can hover class constructor', () => {
        const hover = getHover(3, 14);
        expect(hover).toEqual(escriptdoc('(class constructor) bar::bar( other := 5 )'))
    });

    it('Can hover function parameter in function expression', () => {
        const hover = getHover(4, 28);
        expect(hover).toEqual(escriptdoc('(parameter) foo123'))
    });

    it('Can hover super function', () => {
        const hover = getHover(11, 8);
        expect(hover).toEqual(escriptdoc('(super) FOO::super( other := 5 )'))
    });

    it('Can hover method function', () => {
        const hover = getHover(14, 19);
        expect(hover).toEqual(escriptdoc('(class method) FOO::method_func( this, what := "everything" )'))
    });

    it('Can hover method function', () => {
        const hover = getHover(18, 18);
        expect(hover).toEqual(escriptdoc('(user function) FOO::static_func( what := "everything" )'))
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
        workspace.open(dir);

        document = workspace.getDocument(src);
    });

    const getHover = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.hover({ line: 1, character });
    };

    it('Can hover module function declaration', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 9);
        expect(hover).toEqual(escriptdoc('(module function) ModuleFunction( a, b := 5 )'))
    });

    it('Can hover module function parameter (no default)', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 19);
        expect(hover).toEqual(escriptdoc('(parameter) b := 5'))
    });

    it('Can hover module function parameter (with default)', () => {
        const hover = getHover('ModuleFunction(a, b := 5);', 16);
        expect(hover).toEqual(escriptdoc('(parameter) a'))
    });
});

describe('Hover Docs', () => {
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
            getContents,
            getXmlDocPath(moduleEmFile) {
                if (extname(moduleEmFile).toLowerCase() !== '.em') {
                    return null;
                }
                const result = resolve(xmlDocDir, basename(moduleEmFile, '.em') + "em.xml");
                return result;
            }
        });
        workspace.open(dir);

        document = new LSPDocument(workspace, src);
    });

    afterAll(() => {
    });

    const getHover = (source: string, character: number) => {
        text = source;
        document.analyze();
        return document.hover({ line: 1, character });
    };

    it('Can hover module functions with XML docs', () => {
        const hover = getHover('use uo; CreateItemInBackpack( "of_character", "objtype", amount := 1, x := -1, y := -1 );', 15);
        const expected = `\`\`\`escriptdoc
(module function) CreateItemInBackpack( of_character, objtype, amount := 1, x := -1, y := -1 )
\`\`\`
---
Creates an item in a character's backpack. Notes: Adds to an existing stack in the top level of the container, if an appropriate stack can be found (meaning, can hold the new amount, the existing item stack has color equal to its itemdesc.cfg color property AND has equal CProps as its itemdesc.cfg entry (not counting locally and globally ignored cprops).  If no appropritate stack is found, creates a new stack. Runs the item's create script, if any.Calls the container's canInsert and onInsert scripts, if any.

_Returns_:

- Item Reference on success

_Errors_:

- A parameter was invalid.
- Character has no backpack.
- That item is not stackable.  Create one at a time.
- That container is full
- Failed to create that item type`
        expect(hover?.trim()).toEqual(expected);
    });

    it('Can hover user functions with multi-line comment docs', () => {
        const hover = getHover(`foo();
/**
 * My test function
 *
 * second line
 *
 * third line
 */
function foo() endfunction`, 2);

        const expected = `\`\`\`escriptdoc
(user function) foo()
\`\`\`
---
My test function

second line

third line`;

        expect(hover?.trim()).toEqual(expected);
    });

    it('Can hover user functions with single-line comment docs', () => {
        const hover = getHover(`foo();
// My test function with single comment line
function foo() endfunction`, 2);

        const expected = `\`\`\`escriptdoc
(user function) foo()
\`\`\`
---
My test function with single comment line`;

        expect(hover?.trim()).toEqual(expected);
    });
});

describe('Tokens - SRC', () => {
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
        workspace.open(dir);

        document = new LSPDocument(workspace, src);
    });

    const getTokens = (source: string) => {
        text = source;
        document.analyze();
        return document.tokens();
    };

    it('Handles new line with LF', () => {
        const textLF = '"foo\nbar";\n1;\n2;\n\n"foo\nbar\n\nbaz";';
        const textCRLF = textLF.replace(/\n/g, '\r\n');
        const tokensLF = getTokens(textLF)
        const tokensCRLF = getTokens(textCRLF)
        expect(tokensLF).toEqual(tokensCRLF);
    })
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
        workspace.open(dir);

        document = workspace.getDocument(src);
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
            range: { start: { line: 10, character: 0 }, end: { line: 10, character: 39 } },
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

    it('Can define program parameter', () => {
        const definition = getDefinition('program foo(bar) endprogram', 13);
        expect(definition).toEqual({
            range: { start: { line: 0, character: 12 }, end: { line: 0, character: 15 } },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define use declaration (identifier)', () => {
        const definition = getDefinition('use file;', 7);
        const pathname = resolve(dir, moduleDirectory, 'file.em');
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            fsPath: pathname
        });
    });

    it('Can define use declaration (string)', () => {
        const definition = getDefinition('use "file";', 7);
        const pathname = resolve(dir, moduleDirectory, 'file.em');
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            fsPath: pathname
        });
    });

    it('Can define include declaration (identifier)', () => {
        const definition = getDefinition('include sysevent;', 13);
        const pathname = resolve(includeDirectory, 'sysevent.inc');
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            fsPath: pathname
        });
    });

    it('Can define include declaration (string)', () => {
        const definition = getDefinition('include ":TestClient:communication";', 13);
        const pathname = resolve(polDirectory, 'testpkgs', 'client', 'communication.inc');
        expect(definition).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            fsPath: pathname
        });
    });
});


describe('Definition - Classes', () => {
    let document: LSPDocument;

    beforeAll(() => {
        const src = 'in-memory-file.src';
        const getContents = (pathname: string) => {
            if (pathname === src) {
                return classes_src;
            }
            return readFileSync(pathname, 'utf-8');
        };

        const workspace = new LSPWorkspace({
            getContents
        });
        workspace.open(dir);

        document = workspace.getDocument(src);
    });

    const getDefinition = (line: number, character: number) => {
        document.analyze();
        return document.definition({ line, character });
    };

    it('Can define class', () => {
        const definition = getDefinition(24, 10);
        expect(definition).toEqual({
            range: {
                start: { line: 8, character: 0 },
                end: { line: 20, character: 8 }
            },
            fsPath: 'in-memory-file.src'
        });
    });

    it('Can define module', () => {
        const definition = getDefinition(15, 9);
        expect(definition).toEqual({
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
            },
            fsPath: resolve(moduleDirectoryAbs, 'basicio.em')
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
        workspace.open(dir);

        document = workspace.getDocument(src);
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
        workspace.open(dir);

        document = workspace.getDocument(src);
    });

    const getCompletion = (source: string, character: number, continueOnError?: boolean) => {
        text = source;
        document.analyze(continueOnError);
        return document.completion({ line: 1, character });
    };

    it('Can complete module functions from parser-invalid source when continueAnalysisOnError is true', () => {
        const hover = getCompletion('use uo; ListItems', 17, true);
        expect(hover).toEqual([
            { label: 'ListItemsAtLocation', kind: 3 },
            { label: 'ListItemsInBoxOfObjType', kind: 3 },
            { label: 'ListItemsNearLocation', kind: 3 },
            { label: 'ListItemsNearLocationOfType', kind: 3 },
            { label: 'ListItemsNearLocationWithFlag', kind: 3 }
        ]);
    });

    it('Can not complete module functions from parser-invalid source when continueAnalysisOnError is false', () => {
        const hover = getCompletion('use uo; ListItems', 17, false);
        expect(hover).toEqual([]);
    });

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
            { label: 'CRMULTI_IGNORE_WORLDZ', kind: 21 },
            { label: 'CRMULTI_KEEP_COMPONENTS', kind: 21 },
            { label: 'CRMULTI_RECREATE_COMPONENTS', kind: 21 },
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
        workspace.open(dir);

        document = workspace.getDocument(src);
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
                'label': 'SendSysMessage(character, text, font := 3, color := 1000)',
                'parameters': [
                    { 'label': [15, 24] },
                    { 'label': [26, 30] },
                    { 'label': [32, 36] },
                    { 'label': [43, 48] }]
            }],
            'activeSignature': 0,
            'activeParameter': 0
        });
    });

    it('Can signature help user functions', () => {
        const signatureHelp = getSignatureHelp('hello("foo", "bar"); function hello(unused foo, unused bar := 5) endfunction', 16);

        expect(signatureHelp).toEqual({
            'signatures': [{
                'label': 'hello(foo, bar := 5)',
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
            [12, 'Compare', 0],
            [21, 'Compare', 1],
            [33, 'Compare', 2],
            [42, 'SubStrReplace', 0],
            [50, 'SubStrReplace', 1],
            [57, 'SubStrReplace', 2],
            [63, 'Compare', 3],
            [69, 'Trim', 0],
            [76, 'Trim', 1]
        ] as const;

        for (const [character, expectedFunctionName, activeParameter] of where) {
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

describeLongTest('Actively typing sources', () => {
    class DynamicDocument {
        tokens: Array<string>;
        index: number;
        text: string;
        document: LSPDocument;

        constructor(data: string, index = 0) {
            const regex = /([^\s]+)|\n/g;
            this.tokens = data.match(regex) ?? [];

            this.index = index;
            this.text = this.tokens.slice(0, index).join(" ");

            const dir = __dirname;
            const src = 'in-memory-file.src';
            let calls = 0;
            const getContents = (pathname: string) => {
                if (pathname === src) {
                    if (this.index < this.tokens.length) {
                        this.text += " " + this.tokens[this.index];
                        this.index++;
                    }
                    return this.text;
                }
                return readFileSync(pathname, 'utf-8');
            };

            const workspace = new LSPWorkspace({
                getContents
            });
            workspace.open(dir);

            this.document = new LSPDocument(workspace, src);
        }

        finished() {
            return this.index >= this.tokens.length;
        }

        analyze() {
            this.document.analyze();
            return this.document.diagnostics();
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
    }

    for (const folder of ['escript', 'pol']) {
        const scriptsDir = resolve(__dirname, '..', 'polserver', 'testsuite', folder);
        const files = readDirectoryRecursive(scriptsDir);
        for (const basefile of files) {
            if (extname(basefile) !== '.src') continue;
            const file = resolve(scriptsDir, basefile);
            it(`Processing ${file}`, async () => {
                const data = await readFile(file, 'utf-8');
                const doc = new DynamicDocument(data, 0);
                // process.stderr.write(`Processing ${file}\n`);
                const processFile = () => {
                    while (!doc.finished()) {
                        try {
                            doc.analyze();
                        } catch (e) {
                            throw new Error(`Error on ${file} [index: ${doc.index}]: ${e instanceof Error ? e.message : e}\n\n${doc.text}`);
                        }
                    }
                };
                expect(processFile).not.toThrow();
            });
        }
    }
});

describe('References - SRC', () => {
    const getReferences = async (source: string, character: number, mocks: Record<string, string> = {}, src = 'in-memory-file.src') => {
        const workspace = new LSPWorkspace({
            getContents(pathname) {
                if (pathname.endsWith(src)) {
                    return source;
                } else if (basename(pathname) in mocks) {
                    return mocks[basename(pathname)];
                }
                return readFileSync(pathname, 'utf-8');
            }
        });
        workspace.open(dir);
        await workspace.updateCache();

        const document = workspace.getDocument(src);
        document.analyze();
        if (document.diagnostics().length) {
            throw new Error(inspect(document.diagnostics()));
        };

        return document.references({ line: 1, character });
    };

    const expectReference = (references: {
        range: Range;
        fsPath: string;
    }[] | undefined, filename: string, range: Range) => {
        if (references === undefined) {
            throw new Error("No references found");
        }
        for (const reference of references) {
            if (reference.fsPath.endsWith(filename) && reference.range.start.line == range.start.line && reference.range.start.character == range.start.character && reference.range.end.line === range.end.line && reference.range.end.character === range.end.character) {
                return;
            }
        }
        throw new Error(`Reference for '${filename} at ${JSON.stringify(range)} not found. References: ${JSON.stringify(references, undefined, 2)}`);
    }

    it('Can get constants inside source that are defined in source', async () => {
        const references = await getReferences('const FOO := 1234; Print(FOO);', 8);

        // Inside Print arguments
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 25 },
            end: { line: 0, character: 28 }
        });
    });

    it('Can get constants inside source that are defined in module files', async () => {
        const references = await getReferences('use uo; Print(MOVEOBJECT_FORCELOCATION);', 19);

        toBeDefined(references, "No references found");

        // References should be >1 as it includes other sources in pol-core's testsuite
        expect(references.length).toBeGreaterThan(1);

        // Find the reference in the current source
        const foundSorceReference = references.find(foo => foo.fsPath.endsWith('in-memory-file.src'));
        toBeDefined(foundSorceReference, "Did not find a reference including 'in-memory-file.src'.");
    });

    it('Can get module functions inside module', async () => {
        const pathname = resolve(dir, moduleDirectory, 'basicio.em');
        const references = await getReferences('Print( anything, console_color:="" );', 3, {}, pathname);

        toBeDefined(references, "No references found");

        // References should be >1 as it includes other sources in pol-core's testsuite
        expect(references.length).toBeGreaterThan(1);
    });

    it('Can get module functions inside source', async () => {
        const references = await getReferences('Print("foo");', 3);

        toBeDefined(references);

        // References should be >1 as it includes other sources in pol-core's testsuite
        expect(references.length).toBeGreaterThan(1);

        // Inside top-level statement
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 }
        });
    });

    it('Can get global variable across includes', async () => {
        const references = await getReferences('include "testutil"; include "sysevent"; var globalInSource; globalInSource := 1; baz(); baz2();', 66, {
            'testutil.inc': "function baz() foob; globalInSource; endfunction",
            'sysevent.inc': "function baz2() foob; globalInSource; endfunction",
        });

        // Inside top-level statement
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 60 },
            end: { line: 0, character: 74 }
        });

        // Inside testutil.inc baz() function
        expectReference(references, 'testutil.inc', {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 35 }
        });

        // Inside sysevent.inc baz2() function
        expectReference(references, 'sysevent.inc', {
            start: { line: 0, character: 22 },
            end: { line: 0, character: 36 }
        });
    });

    it('Can get local variable', async () => {
        const references = await getReferences('function bar() var foo := 1; if (foo) Print(foo + 3 * foo); endif endfunction bar();', 21);

        // inside conditional
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 33 },
            end: { line: 0, character: 36 }
        });

        // inside print argument
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 44 },
            end: { line: 0, character: 47 }
        });

        // inside print argument
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 54 },
            end: { line: 0, character: 57 }
        });
    });

    it('Can get user function inside source defined in source', async () => {
        const references = await getReferences('function bar() var foo := 1; if (foo) Print(foo + 3 * foo); endif endfunction if (bar()) bar(); endif', 10);

        // Inside conditional
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 82 },
            end: { line: 0, character: 85 }
        });

        // Inside if-statement body
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 89 },
            end: { line: 0, character: 92 }
        });
    });

    it('Can get user function inside source defined in include', async () => {
        const references = await getReferences('include "testutil"; baz();', 21, {
            'testutil.inc': "function baz() return 1; endfunction; baz();"
        });

        // Inside top-level statement
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 20 },
            end: { line: 0, character: 23 }
        });

        // Inside testutil.inc top-level statement
        expectReference(references, 'testutil.inc', {
            start: { line: 0, character: 38 },
            end: { line: 0, character: 41 }
        });
    });

    it('Can get program parameter', async () => {
        const references = await getReferences('program main(who); Print(who); endprogram', 14);

        // Inside program body
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 25 },
            end: { line: 0, character: 28 }
        });
    });

    it('Can get function parameter', async () => {
        const references = await getReferences('function main(who); Print(who); endfunction main(1234);', 16);

        // Inside function body
        expectReference(references, 'in-memory-file.src', {
            start: { line: 0, character: 26 },
            end: { line: 0, character: 29 }
        });
    });
});

describe('Workspace Cache', () => {
    const getWorkspace = () => {
        const workspace = new LSPWorkspace({
            getContents: (pathname) => readFileSync(pathname, 'utf-8')
        });
        workspace.open(dir);
        return workspace;
    };

    it('Does not block event loop', async () => {
        const workspace = getWorkspace();

        const start = Date.now();
        const promise = workspace.updateCache();
        let timeout = 0;
        setTimeout(() => timeout = Date.now(), 10);
        const result = await promise;
        const end = Date.now()

        expect(end).toBeGreaterThan(timeout);
        expect(timeout).toBeGreaterThan(start);
        expect(result).toBe(true);
    });

    it('Can cancel', async () => {
        const workspace = getWorkspace();

        const controller = new AbortController();
        let lastProgress = { count: 0, total: 0 };

        const p1 = workspace.updateCache((progress) => {
            const { count, total } = lastProgress = progress;
            if (count / total >= 0.5) {
                controller.abort();
            }
        }, controller.signal);

        const result = await p1;

        expect(result).toBe(false);
        expect(lastProgress.count / lastProgress.total).toBeGreaterThanOrEqual(0.5);
    });
});

describe('Formatter', () => {
    const getFormattedString = (source: string, range?: Range) => {
        const workspace = new LSPWorkspace({
            getContents(pathname) {
                if (pathname.endsWith('in-memory-file.src')) {
                    return source;
                }
                return readFileSync(pathname, 'utf-8');
            }
        });
        workspace.open(dir);

        const document = workspace.getDocument('in-memory-file.src');
        return document.toFormattedString(undefined, range);
    };

    const findRange = (text: string): Range | undefined => {
        const lines = text.split('\n');
        let line = 0;
        let character = -1;
        let start: Position | undefined;
        let end: Position | undefined;

        for (let i = 0; i < lines.length; i++) {
            const text = lines[i];
            const index = text.indexOf('#');
            const lastIndex = text.lastIndexOf('#');
            if (index !== -1) {
                line = i + 1;
                character = index;
                if (start) {
                    end = { line, character };
                    break;
                }
                else {
                    start = { line, character };
                }
            }
            if (lastIndex !== index) {
                line = i + 1;
                character = lastIndex;
                end = { line, character };
                break;
            }
        }
        if (!start || !end) {
            return undefined;
        }
        return { start, end };
    }


    const formatSrcsDir = join(__dirname, 'format-srcs');
    const files = readdirSync(formatSrcsDir)
        .reduce((p, c) => c.endsWith(".src") ? p.add(c.substring(0, c.indexOf('.'))) : p, new Set<string>());

    for (const file of files) {
        const src = readFileSync(join(formatSrcsDir, file + ".src"), 'utf-8').replace(/\r/g, '');
        const out = readFileSync(join(formatSrcsDir, file + ".out.src"), 'utf-8').replace(/\r/g, '');
        const rawLines = src.split(/\n/);
        const firstCommentIndex = rawLines[0].indexOf('// ');
        const testName = firstCommentIndex > -1 ? rawLines[0].substring(firstCommentIndex + 3) : rawLines[0];

        it(testName, () => {
            const formatRange = findRange(src);
            const formatted = getFormattedString(src.replace(/#/g, ''), formatRange).replace(/\r/g, '');
            expect(formatted).toEqual(out);
        })
    }
});
