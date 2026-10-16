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
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const production = !watch;

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

const entries = [
    {
        ...common,
        entryPoints: ['client/src/extension.ts'],
        outfile: 'dist/extension.js'
    },
    {
        ...common,
        entryPoints: ['server/src/index.ts'],
        outfile: 'dist/server.js'
    }
];

if (watch) {
    // The Extension Development Host loads `dist/`, so the debug launch's watch
    // task has to rebuild it; `tsc -b -w` alone only refreshes `*/out`.
    await Promise.all(entries.map(async options => (await context(options)).watch()));
} else {
    await Promise.all(entries.map(options => build(options)));
}
