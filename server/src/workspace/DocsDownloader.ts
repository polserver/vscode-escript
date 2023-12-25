import { spawn } from 'child_process';
import * as os from 'os';
import * as readline from 'readline';
import { join, extname, basename } from 'path';
import * as fsPromises from 'fs/promises';
import readdir = fsPromises.readdir
import copyFile = fsPromises.copyFile
import mkdir = fsPromises.mkdir

import type { LSPWorkspace } from 'vscode-escript-native';
import { LSPServer } from '../server/connection';

export default class DocsDownloader {
    private static readonly POL_REV_REGEX = /\(Rev. ([0-9a-fA-F]{9})\)/;

    public constructor(private workspace: LSPWorkspace) { }

    private async downloadDoc(commitId: string, moduleName: string): Promise<void> {
        const uri = `https://raw.githubusercontent.com/polserver/polserver/${commitId}/docs/docs.polserver.com/pol100/${moduleName}em.xml`;

        try {
            const outDir = join(LSPServer.options.storageFsPath, commitId);
            const outFile = join(outDir, `${moduleName}em.xml`);

            await mkdir(outDir, { recursive: true });
            const localUri = `/Users/kevineady/UO/polserver/docs/docs.polserver.com/pol100/${moduleName}em.xml`;
            console.log("copy", localUri, "to", outFile);
            copyFile(localUri, outFile);
        } catch (ex) {
            throw new Error(`Could not create storage folder for ${commitId}: ${ex}`);
        }
    }

    private async availableModules(): Promise<Array<string>> {
        const directory = this.workspace.getConfigValue('ModuleDirectory');
        const files = await readdir(directory);
        return files.reduce((p, c) => extname(c).toLocaleLowerCase() == '.em' ? (p.push(basename(c, extname(c))), p) : p, new Array<string>());
    }

    private getPolRevision(): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            const polPath = join(this.workspace.workspaceRoot, `pol${process.platform === 'win32' ? '.exe' : ''}`);

            const proc = spawn(polPath, {
                cwd: os.tmpdir()
            });

            const rl = readline.createInterface(proc.stdout);

            const timeoutId = setTimeout(() => {
                proc.kill('SIGKILL');
            }, 1000);

            let revision: string | null = null;

            rl.on('line', (data: string) => {
                let matches = data.match(DocsDownloader.POL_REV_REGEX);
                if (matches) {
                    clearTimeout(timeoutId);
                    revision = matches[1];
                    proc.kill('SIGKILL');
                }
            });

            proc.on('error', () => {
                resolve(null);
            })

            proc.on('exit', () => {
                resolve(revision);
            });
        });
    }

    public async start() {
        const commitId = await this.getPolRevision();
        if (commitId) {
            const modules = await this.availableModules();
            for (const moduleName of modules) {
                this.downloadDoc(commitId, moduleName);
            }
        }
    }
}
