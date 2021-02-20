import { promises as fsPromise } from 'fs';
import * as mock from 'mock-fs';
import { resolve } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { SourceFile } from '../src/workspace/source-file';
import { CfgFileReader, Workspace } from '../src/workspace/workspace';
import readFile = fsPromise.readFile;

describe('SourceFile', function () {
    beforeEach(() => {
        expect(Workspace.count).toEqual(0);
        mock({
            '/ModernDistro': {
                'pol.cfg': '',
                'scripts': {
                    'include': {
                        'client.inc': 'const SFX_1     :=  0x0001;'
                    },
                    'modules': {
                        'basicio.em': 'Print(what)'
                    },
                    'ecompile.cfg': 'ModuleDirectory=/ModernDistro/scripts/modules/\nIncludeDirectory=/ModernDistro/scripts/\nPolScriptRoot=/ModernDistro/scripts/\nPackageRoot=/ModernDistro/pkg\nPackageRoot=/ModernDistro/devpkg\n',
                    'start.src': 'program main() print("Hello world!"); endprogram',
                    'error.src': 'program main()'
                },
            }
        });
    });

    afterEach(() => {
        mock.restore();
        Workspace.closeAll();
    });

    function toBeDefined<T>(val?: T): asserts val is NonNullable<T> {
        if (val === undefined) { throw new Error('Value is undefined'); }
    }

    test('Can construct new SourceFile on SourceFileType.SRC with valid AST', async () => {
        const path = '/ModernDistro/scripts/start.src';
        const workspace = await Workspace.find(path);
        toBeDefined(workspace);
        const uri = URI.file(path).toString();
        const sourceFile = new SourceFile(TextDocument.create(uri, 'escript', 1, await readFile(path, 'utf-8')));
        toBeDefined(sourceFile.ast);
    });

    test('Can construct new SourceFile on SourceFileType.INC with valid AST', async () => {
        const path = '/ModernDistro/scripts/include/client.inc';
        const workspace = await Workspace.find(path);
        toBeDefined(workspace);
        const uri = URI.file(path).toString();
        const sourceFile = new SourceFile(TextDocument.create(uri, 'escript', 1, await readFile(path, 'utf-8')));
        toBeDefined(sourceFile.ast);
    });

    test('Can construct new SourceFile on SourceFileType.EM with valid AST', async () => {
        const path = '/ModernDistro/scripts/modules/basicio.em';
        const workspace = await Workspace.find(path);
        toBeDefined(workspace);
        const uri = URI.file(path).toString();
        const sourceFile = new SourceFile(TextDocument.create(uri, 'escript', 1, await readFile(path, 'utf-8')));
        toBeDefined(sourceFile.ast);
    });

    test('Can construct new SourceFile on SourceFileType.SRC with invalid AST', async () => {
        const path = '/ModernDistro/scripts/error.src';
        const workspace = await Workspace.find(path);
        toBeDefined(workspace);
        const uri = URI.file(path).toString();
        const sourceFile = new SourceFile(TextDocument.create(uri, 'escript', 1, await readFile(path, 'utf-8')));
        toBeDefined(sourceFile.ast);
        expect(sourceFile.ast.parserErrors).toHaveLength(1);
    });
});
