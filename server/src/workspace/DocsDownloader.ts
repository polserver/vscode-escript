import { spawn } from 'child_process';
import * as os from 'os';
import * as readline from 'readline';
import { join, extname, basename, dirname } from 'path';
import { readdir, mkdir, access } from 'fs/promises';
import { createWriteStream, unlink } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { eachLimit } from 'async';
import { F_OK } from 'constants';

export default class DocsDownloader {
    private static readonly POL_REV_REGEX = /\(Rev. ([0-9a-fA-F]{9})\)/;
    public commitId: string | null = null;

    public constructor(private storageFsPath: string, private logging = true) { }

    private log(...args: any[]) {
        if (this.logging)
        {console.log(...args);}
    }

    // TODO fix race conditions if multiple starts called (eg. from didChangeConfiguration)
    public async start(workspaceRoot: string, moduleDirectory: string, commitId: string | null = null) {
        if ((commitId === '' || commitId === null) && this.commitId) {
            this.log('DocsDownloader', 'using existing commit', this.commitId);
            return;
        }

        if (!commitId) {
            this.log('DocsDownloader', 'finding commit from pol executable');
            this.commitId = commitId = await this.getPolRevision(workspaceRoot);
            this.log('DocsDownloader', 'found commit id', commitId);
        } else {
            this.log('DocsDownloader', 'using provided commitId', commitId);
            this.commitId = commitId;
        }

        if (commitId) {
            const _commitId = commitId;
            const modules = await this.availableModules(moduleDirectory);
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
            const docFile = join(this.storageFsPath, commitId, `${moduleName}em.xml`);
            this.log(`Returning docFile for ${moduleEmFile} => ${docFile}`);
            return docFile;
        }

        return null;
    }

    private async downloadDoc(commitId: string, moduleName: string): Promise<void> {
        const uri = `https://raw.githubusercontent.com/polserver/polserver/${commitId}/docs/docs.polserver.com/pol100/${moduleName}em.xml`;

        try {
            const outDir = join(this.storageFsPath, commitId);
            const outFile = join(outDir, `${moduleName}em.xml`);

            await mkdir(outDir, { recursive: true });

            try {
                await access(outFile, F_OK);
                this.log('DocsDownloader', 'already exists', outFile);
            } catch {
                this.log('DocsDownloader', 'download', uri, 'to', outFile);
                await this.download(uri, outFile);
                this.log('DocsDownloader', 'downloaded', uri);
            }
        } catch (ex) {
            throw new Error(`Could not create storage folder for ${commitId}: ${ex}`);
        }
    }

    private async availableModules(moduleDirectory: string): Promise<Array<string>> {
        const files = await readdir(moduleDirectory);
        return files.reduce((p, c) => extname(c).toLocaleLowerCase() === '.em' ? (p.push(basename(c, extname(c))), p) : p, new Array<string>());
    }

    private getPolRevision(workspaceRoot: string): Promise<string | null> {
        if (this.commitId !== null) {
            return Promise.resolve(this.commitId);
        }

        return new Promise<string | null>((resolve) => {
            const polPath = join(workspaceRoot, `pol${process.platform === 'win32' ? '.exe' : ''}`);

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
            mkdir(dirname(filePath), { recursive: true })
                .then(() => {
                    const file = createWriteStream(filePath);

                    const request = proto.get(url, {}, response => {
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
                })
                .catch(e => reject(e));
        });
    }
}
