import { LSPServer } from './server/connection';

import { parseArgs } from 'node:util';

import { join } from 'path';
import { URI } from 'vscode-uri';

const { values: { storageUri = join(process.cwd(), '.escript-lsp') } } = parseArgs({
    args: process.argv.slice(2),
    strict: false,
    options: {
        'storageUri': {
            type: 'string',
        }
    }
});

const options = {
    storageFsPath: URI.parse(String(storageUri)).fsPath
};

console.log(`Escript Language Server started [pid ${process.pid}]`);
new LSPServer(options).listen();
