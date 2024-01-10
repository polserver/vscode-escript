import * as mock from 'mock-fs';
import * as child_process from 'child_process';
import { join } from 'path';
import DocsDownloader from '../src/workspace/DocsDownloader';
import * as https from 'https';
import * as EventEmitter from 'events';
import { Readable } from 'stream';
import type { ClientRequest, IncomingMessage } from 'http';

const workspaceRoot = '/ModernDistro';
const moduleDirectory = join(workspaceRoot, 'modules');
const storageDir = '/tmp';
const commitId = '013a11238';

const mockChildProcess = (): child_process.ChildProcess => {
    const proc = new EventEmitter() as child_process.ChildProcess;

    const stdout = proc.stdout = new EventEmitter() as Readable;
    proc.stdout.resume = () => stdout;
    proc.kill = () => proc.emit('exit', 1);

    proc.stderr = new EventEmitter() as Readable;

    return proc;
};

const mockClientRequest = (url: string | URL, options: https.RequestOptions, callback?: ((res: IncomingMessage) => void) | undefined): ClientRequest => {
    const request = new EventEmitter() as ClientRequest;
    request.end = (cb?: (() => void) | undefined) => {
        const res = {} as IncomingMessage;
        res.statusCode = 200;
        res.pipe = <T extends NodeJS.WritableStream>(
            destination: T,
            options?: {
                end?: boolean | undefined;
            }
        ): T => {
            destination.emit('finish');
            return destination;
        };

        callback?.(res);
        return request;
    };

    return request;
};

beforeEach(() => {
    mock({
        '/ModernDistro': {
            'pol.cfg': '',
            'scripts': {
                'ecompile.cfg': 'ModuleDirectory=/ModernDistro/scripts/modules/\nIncludeDirectory=/ModernDistro/scripts/\nPolScriptRoot=/ModernDistro/scripts/\nPackageRoot=/ModernDistro/pkg\nPackageRoot=/ModernDistro/devpkg\n',
            },
            'modules': {
                'uo.em': 'CreateItemInBackpack( of_character, objtype, amount := 1, x := -1, y := -1 );\n',
                'basic.em': 'Compare(str1, str2, pos1_start:=0, pos1_end:=0, pos2_start:=0, pos2_end:=0);\n',
                'basicio.em': 'Print( anything, console_color:="" );\n',
            }
        },
        '/tmp': {
        }
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    mock.restore();
});

describe('DocsDownloader', () => {
    test('Can get POL revision from executable', async () => {
        const proc = mockChildProcess();

        jest
            .spyOn(child_process, 'spawn')
            .mockReturnValueOnce(proc);

        const downloader = new DocsDownloader(storageDir, false);
        const revPromise = downloader['getPolRevision'](workspaceRoot);

        proc.stdout?.emit('data', `POL 100.1.0 - Never Gonna Give You Up - Apple 64bit (Rev. ${commitId})
Compiled on Jan  5 2024 22:22:14
Copyright (C) 1993-2021 Eric N. Swanson

Using 4 out of 8 worldsave threads
Reading Configuration.
Unable to open configuration file pol.cfg 2: No such file or directory
Server Shutdown: reading pol.cfg
Initiating POL Cleanup....
Execution aborted due to: Unable to open configuration file pol.cfg\n`);

        expect(await revPromise).toEqual(commitId);
    });

    test('Can get path for XML document for .em files', () => {
        const downloader = new DocsDownloader(storageDir, false);
        downloader.commitId = commitId;
        const xmlDocPath = downloader.getXmlDocPath('/ModernDistro/scripts/modules/uo.em');

        expect(xmlDocPath).toEqual(join(storageDir, commitId, 'uoem.xml'));
    });

    test('Will return null for XML document path for non-.em files', () => {
        const downloader = new DocsDownloader(storageDir, false);
        downloader.commitId = commitId;
        const xmlDocPath = downloader.getXmlDocPath('/ModernDistro/pol.cfg');

        expect(xmlDocPath).toEqual(null);
    });

    test('Will return null for XML document path when no commitId set', () => {
        const downloader = new DocsDownloader(storageDir, false);
        const xmlDocPath = downloader.getXmlDocPath('/ModernDistro/scripts/modules/uo.em');

        expect(xmlDocPath).toEqual(null);
    });

    test('Can cache commit ID when already set', async () => {
        const downloader = new DocsDownloader(storageDir, false);
        downloader.commitId = commitId;
        jest
            .spyOn(child_process, 'spawn')
            .mockImplementationOnce(() => { throw new Error('Unexpected process spawn request'); });

        const polRevision = await downloader['getPolRevision'](workspaceRoot);

        expect(polRevision).toEqual(commitId);
    });

    test('Can download an XML documentation', async () => {
        const downloader = new DocsDownloader(storageDir, false);
        const filePath = join(storageDir, commitId, 'uoem.xml');

        jest
            .spyOn(https, 'get')
            .mockImplementationOnce(mockClientRequest);

        await downloader['download']('https://foo/uoem.xml', filePath);
    });

    test('Can download all modules', async () => {
        const downloader = new DocsDownloader(storageDir, false);
        downloader.commitId = commitId;
        const inst = jest.spyOn(downloader, 'downloadDoc' as any) as jest.SpyInstance<Promise<void>, [commitId: string, moduleName: string], any>;
        const downloadedModules = new Array<string>();

        inst.mockImplementation(async (commitId: string, moduleName: string)=>{
            downloadedModules.push(moduleName);
        });

        await downloader.start(workspaceRoot, moduleDirectory, commitId);

        expect(downloadedModules.sort()).toEqual(['basic', 'basicio', 'uo']);
    });

    test('Can get available modules', async () => {
        const downloader = new DocsDownloader(storageDir, false);
        const availableModules = await downloader['availableModules'](moduleDirectory);
        expect(availableModules.sort()).toEqual(['basic', 'basicio', 'uo']);
    });
});
