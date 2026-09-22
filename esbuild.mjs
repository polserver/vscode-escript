/**
 * Bundles the extension host client and the language server.
 *
 * Before this, both shipped as raw `tsc` output next to their own
 * `node_modules`, so the `.vsix` carried three near-identical copies of the
 * `vscode-jsonrpc` / `vscode-languageserver-*` trees -- ~750 files and ~4.3 MB
 * to support ~67 KB of project code -- and the server paid for resolving and
 * parsing all of it on every boot.
 *
 * Two things are deliberately left external:
 *
 *  - `vscode`, which is injected by the extension host and has no package.
 *  - `*.node`, the compiled addon. `native/src/index.ts` locates it at runtime
 *    through a computed `require()`, which esbuild leaves alone; the roots it
 *    searches account for this file's bundled location.
 */
import { build } from 'esbuild';

const production = !process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['vscode', '*.node'],
    minify: false,
    sourcemap: production ? false : 'inline',
    logLevel: 'info'
};

await Promise.all([
    build({
        ...common,
        entryPoints: ['client/src/extension.ts'],
        outfile: 'dist/extension.js'
    }),
    build({
        ...common,
        entryPoints: ['server/src/index.ts'],
        outfile: 'dist/server.js'
    })
]);
