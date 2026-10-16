import { installCrashHandlers, formatError } from './misc/Diagnostics';

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

installCrashHandlers(options.storageFsPath);

console.log(`Escript Language Server started [pid ${process.pid}]`);

// `./server/connection` loads the native addon at its top level, and a static
// `import` of it would be hoisted above installCrashHandlers() -- leaving the
// single most likely startup failure completely unreported. Requiring it here
// keeps the ordering real.
try {
    const { LSPServer } = require('./server/connection') as typeof import('./server/connection');
    new LSPServer(options).listen();
} catch (e) {
    process.stderr.write(
        `[escript-lsp] Failed to start the language server: ${formatError(e)}\n`
    );
    process.exit(1);
}
