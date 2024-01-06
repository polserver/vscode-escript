import { spawn } from 'child_process';
import * as os from 'os';
import * as readline from 'readline';
import { join, extname, basename } from 'path';
import { readdir, mkdir, access } from 'fs/promises';
import { createWriteStream, unlink } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { eachLimit } from 'async';
import { F_OK } from 'constants';
import type { LSPWorkspace } from 'vscode-escript-native';
import { LSPServer } from '../server/connection';

export default class DocsDownloader {
    private static readonly POL_REV_REGEX = /\(Rev. ([0-9a-fA-F]{9})\)/;
    public commitId: string | null = null;
    private workspace: LSPWorkspace | null = null;

    public constructor() { }

    // TODO fix race conditions if multiple starts called (eg. from didChangeConfiguration)
    public async start(workspace: LSPWorkspace, commitId: string | null = null) {
        this.workspace = workspace;
        if ((commitId === '' || commitId === null) && this.commitId) {
            console.log('DocsDownloader', 'using existing commit', this.commitId);
            return;
        }

        if (!commitId) {
            console.log('DocsDownloader', 'finding commit from pol executable');
            this.commitId = commitId = await this.getPolRevision();
            console.log('DocsDownloader', 'found commit id', commitId);
        } else {
            console.log('DocsDownloader', 'using provided commitId', commitId);
            this.commitId = commitId;
        }

        if (commitId) {
            const _commitId = commitId;
            const modules = await this.availableModules();
            await eachLimit(modules, 5, (moduleName, cb) => {
                this.downloadDoc(_commitId, moduleName)
                    .then(_ => cb())
                    .catch(e => cb(e));
            });
        }
    }

    public getXmlDocPath(moduleEmFile: string): string | null {
        if (extname(moduleEmFile).toLowerCase() !== '.em') {
            return null;
        }

        const { commitId: commitId } = this;

        if (commitId) {
            const moduleName = basename(moduleEmFile, extname(moduleEmFile));
            const docFile = join(LSPServer.options.storageFsPath, commitId, `${moduleName}em.xml`);
            console.log(`Returning docFile for ${moduleEmFile} => ${docFile}`);
            return docFile;
        }

        return null;
    }

    private async downloadDoc(commitId: string, moduleName: string): Promise<void> {
        const uri = `https://raw.githubusercontent.com/polserver/polserver/${commitId}/docs/docs.polserver.com/pol100/${moduleName}em.xml`;

        try {
            const outDir = join(LSPServer.options.storageFsPath, commitId);
            const outFile = join(outDir, `${moduleName}em.xml`);

            await mkdir(outDir, { recursive: true });

            try {
                await access(outFile, F_OK);
                console.log('DocsDownloader', 'already exists', outFile);
            } catch {
                console.log('DocsDownloader', 'download', uri, 'to', outFile);
                await this.download(uri, outFile);
                console.log('DocsDownloader', 'downloaded', uri);
            }
        } catch (ex) {
            throw new Error(`Could not create storage folder for ${commitId}: ${ex}`);
        }
    }

    private async availableModules(): Promise<Array<string>> {
        const directory = this.workspace?.getConfigValue('ModuleDirectory');

        if (directory) {
            const files = await readdir(directory);
            return files.reduce((p, c) => extname(c).toLocaleLowerCase() === '.em' ? (p.push(basename(c, extname(c))), p) : p, new Array<string>());
        }

        return Promise.resolve([]);
    }

    private getPolRevision(): Promise<string | null> {
        const { workspace } = this;

        if (this.commitId !== null) {
            return Promise.resolve(this.commitId);
        } else if (workspace === null) {
            return Promise.resolve(null);
        }

        return new Promise<string | null>((resolve) => {
            const polPath = join(workspace.workspaceRoot, `pol${process.platform === 'win32' ? '.exe' : ''}`);

            const proc = spawn(polPath, {
                cwd: os.tmpdir()
            });

            const rl = readline.createInterface(proc.stdout);

            const timeoutId = setTimeout(() => {
                proc.kill('SIGKILL');
            }, 1000);

            rl.on('line', (data: string) => {
                let matches = data.match(DocsDownloader.POL_REV_REGEX);
                if (matches) {
                    clearTimeout(timeoutId);
                    this.commitId = matches[1];
                    proc.kill('SIGKILL');
                }
            });

            proc.on('error', () => {
                resolve(null);
            });

            proc.on('exit', () => {
                resolve(this.commitId);
            });
        });
    }

    private async download(url: string, filePath: string) {
        const proto = !url.charAt(4).localeCompare('s') ? https : http;

        return new Promise<void>((resolve, reject) => {
            const file = createWriteStream(filePath);

            const request = proto.get(url, response => {
                if (response.statusCode !== 200) {
                    unlink(filePath, () => {
                        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                    });
                    return;
                }

                response.pipe(file);
            });

            file.on('finish', () => resolve());

            request.on('error', err => {
                unlink(filePath, () => reject(err));
            });

            file.on('error', err => {
                unlink(filePath, () => reject(err));
            });

            request.end();
        });
    }
}
