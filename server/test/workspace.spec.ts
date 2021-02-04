import * as mock from 'mock-fs';
import { CfgFileReader, Workspace } from '../src/workspace/workspace';

describe('CfgFileReader', () => {
    afterEach(() => {
        mock.restore();
    });

    test('Can parse elements with spaces', async () => {
        mock({ 'test.cfg': 'key value' });
        const cfg = await CfgFileReader.load('test.cfg', true);
        expect(cfg).toHaveProperty('key');
        expect(cfg.key).toEqual(['value']);
    });

    test('Can parse elements with tabs', async () => {
        mock({ 'test.cfg': 'key\tvalue' });
        const cfg = await CfgFileReader.load('test.cfg', true);
        expect(cfg).toHaveProperty('key');
        expect(cfg.key).toEqual(['value']);
    });

    test('Can parse keys with multiple values', async () => {
        mock({ 'test.cfg': 'key\tvalue1\nkey\tvalue2' });
        const cfg = await CfgFileReader.load('test.cfg', true);
        expect(cfg).toHaveProperty('key');
        expect(cfg.key).toEqual(['value1', 'value2']);
    });

    test('Keys are case-insensitive', async () => {
        mock({ 'test.cfg': 'KEY\tvalue' });
        const cfg = await CfgFileReader.load('test.cfg', true);
        expect(cfg).toHaveProperty('key');
    });
});


describe('Workspace', function () {

    beforeEach(() => {
        expect(Workspace.count).toEqual(0);
    });

    afterEach(() => {
        mock.restore();
        Workspace.closeAll();
    });


    function toBeDefined<T>(val: T): asserts val is NonNullable<T> {
        if (val === undefined) { throw new Error('Value is undefined'); }
    }

    const config = {
        'polRoot': '/ModernDistro',
        'includeDirectory': '/ModernDistro/scripts',
        'moduleDirectory': '/ModernDistro/scripts/modules',
        'polScriptRoot': '/ModernDistro/scripts',
        'packageRoots': [
            '/ModernDistro/pkg',
            '/ModernDistro/devpkg'
        ]
    };

    test('Can find Workspace from within same folder as ecompile', async () => {
        mock({
            '/ModernDistro': {
                'pol.cfg': '',
                'scripts': {
                    'ecompile.cfg': 'ModuleDirectory=/ModernDistro/scripts/modules/\nIncludeDirectory=/ModernDistro/scripts/\nPolScriptRoot=/ModernDistro/scripts/\nPackageRoot=/ModernDistro/pkg\nPackageRoot=/ModernDistro/devpkg\n',
                },
            }
        });
        const workspace = await Workspace.find('/ModernDistro/scripts/start.src');
        toBeDefined(workspace);
        expect(workspace.config).toEqual(config);
    });

    test('Can find Workspace from a package script', async () => {
        mock({
            '/ModernDistro': {
                'pol.cfg': '',
                'scripts': {
                    'ecompile.cfg': 'ModuleDirectory=/ModernDistro/scripts/modules/\nIncludeDirectory=/ModernDistro/scripts/\nPolScriptRoot=/ModernDistro/scripts/\nPackageRoot=/ModernDistro/pkg\nPackageRoot=/ModernDistro/devpkg\n',
                },
            }
        });
        const workspace = await Workspace.find('/ModernDistro/pkg/systems/saver/start.src');
        toBeDefined(workspace);
        expect(workspace.config).toEqual(config);
    });

    test('Returns no Workspace if cannot find pol.cfg', async () => {
        mock({
            '/ModernDistro': {
            }
        });
        const workspace = await Workspace.find('/ModernDistro/pkg/systems/saver/start.src');
        expect(workspace).toBeUndefined();
    });

    test('Supports relative paths in ecompile.cfg', async () => {
        mock({
            '/ModernDistro': {
                'pol.cfg': '',
                'scripts': {
                    'ecompile.cfg': 'ModuleDirectory=./scripts/modules/\nIncludeDirectory=./scripts/\nPolScriptRoot=./scripts/\nPackageRoot=./pkg\nPackageRoot=./devpkg\n',
                },
            }
        });
        const workspace = await Workspace.find('/ModernDistro/scripts/start.src');
        toBeDefined(workspace);
        expect(workspace.config).toEqual(config);
    });

    test('Finding two Workspaces simultaneously results in the same object', async () => {
        mock({
            '/ModernDistro': {
                'pol.cfg': '',
                'scripts': {
                    'ecompile.cfg': 'ModuleDirectory=./scripts/modules/\nIncludeDirectory=./scripts/\nPolScriptRoot=./scripts/\nPackageRoot=./pkg\nPackageRoot=./devpkg\n',
                },
            }
        });
        const promiseWorkspace1 = Workspace.find('/ModernDistro/scripts/start.src');
        const promiseWorkspace2 = Workspace.find('/ModernDistro/pkg/systems/saver/start.src');
        const [workspace1, workspace2] = await Promise.all([promiseWorkspace1, promiseWorkspace2]);
        toBeDefined(workspace1);
        toBeDefined(workspace2);
        expect(workspace1).toStrictEqual(workspace2);
    });
});