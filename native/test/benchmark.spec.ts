import { resolve } from 'path';
import { readFileSync } from 'fs';
import { native, type CompilerProfile } from '../src/index';

const { LSPWorkspace } = native;

/**
 * Performance harness, not a correctness test: it asserts almost nothing and
 * exists to produce comparable numbers before and after a change.
 *
 * Gated behind JEST_RUN_LONG_TESTS (`npm run test-all`) like the other slow
 * suites, since it deliberately runs each operation hundreds of times.
 */
// describe.skip rather than a no-op: every test here is gated, so a no-op would
// leave the suite with no tests at all and Jest fails the file outright.
const describeLongTest = process.env['JEST_RUN_LONG_TESTS'] ? describe : describe.skip;

const dir = resolve(__dirname);

/**
 * Fields worth reporting, in the order they occur in a compile. The rest of
 * CompilerProfile is still collected; these are the ones that move.
 */
const REPORTED: ReadonlyArray<keyof CompilerProfile> = [
    'buildWorkspaceMicros',
    'parseSrcMicros',
    'astSrcMicros',
    'parseIncMicros',
    'astIncMicros',
    'parseEmMicros',
    'astEmMicros',
    'astResolveFunctionsMicros',
    'optimizeMicros',
    'disambiguateMicros',
    'analyzeMicros',
    'tokenizeMicros',
    'cacheHits',
    'cacheMisses',
    'ambiguities'
];

function delta(before: CompilerProfile, after: CompilerProfile): string {
    return REPORTED
        .map(key => {
            // Null-coalesced so the harness can also run against a build whose
            // GetProfile predates these counters.
            const value = (after[key] ?? 0) - (before[key] ?? 0);
            return key.endsWith('Micros')
                ? `${key.slice(0, -'Micros'.length)}=${(value / 1000).toFixed(1)}ms`
                : `${key}=${value}`;
        })
        .join(' ');
}

/** Wall-clock milliseconds per iteration. */
function time(iterations: number, fn: (iteration: number) => void): number {
    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        fn(i);
    }
    return Number(process.hrtime.bigint() - startedAt) / 1e6 / iterations;
}

describeLongTest('Benchmarks', () => {
    // Deep enough to exercise the include and module chains, which is where the
    // parse-tree caches and the AST rebuild on top of them show up.
    const source = `use basicio;
use os;
include "testutil";

function helper( a, b := 2 )
    var total := a + b;
    foreach entry in ( { 1, 2, 3 } )
        total := total + entry;
    endforeach
    return total;
endfunction

program bench( args )
    var result := helper( 1 );
    Print( result );
    Print( args );
endprogram
`;

    let text = source;
    const src = resolve(dir, 'benchmark-probe.src');

    const workspace = new LSPWorkspace({
        getContents: (pathname: string) => pathname === src ? text : readFileSync(pathname, 'utf-8')
    });

    const report = (label: string, perOp: number, before: CompilerProfile, after: CompilerProfile) => {
        console.log(`\n  ${label}: ${perOp.toFixed(3)} ms/op\n    ${delta(before, after)}`);
    };

    beforeAll(() => {
        workspace.open(dir);
    });

    it('analyze', () => {
        const document = workspace.getDocument(src);
        document.analyze();

        const before = { ...workspace.profile };
        // Vary the text so nothing can memoize the root file, the way an editing
        // session does.
        const perOp = time(200, i => {
            text = source.replace('var result := helper( 1 );', `var result := helper( ${i} );`);
            document.analyze();
        });
        const after = { ...workspace.profile };

        report('analyze', perOp, before, after);
        expect(perOp).toBeGreaterThan(0);
    });

    // The small fixture above cannot show the parse-tree walk cost: with ~17
    // lines there is nothing to skip. This one is sized like a real script, and
    // probes near the end of it, which is where a walk that visits every node
    // costs the most and a walk pruned by position costs the same as anywhere.
    it('per-request on a large file', () => {
        const functions = 200;
        const lines: string[] = ['use basicio;', 'include "testutil";', ''];

        for (let i = 0; i < functions; i++) {
            lines.push(
                `function generated_${i}( a, b := ${i} )`,
                `    var total_${i} := a + b;`,
                `    foreach entry in ( { 1, 2, 3 } )`,
                `        total_${i} := total_${i} + entry;`,
                `    endforeach`,
                `    return total_${i};`,
                `endfunction`,
                ''
            );
        }

        lines.push('program big( args )', '    var result := generated_0( 1 );');
        // The probe line: last call in the program, far from the root.
        const probeLine = lines.push(`    result := generated_${functions - 1}( result );`);
        lines.push('    Print( result );', '    Print( args );', 'endprogram', '');

        let bigText = lines.join('\n');

        const bigSrc = resolve(dir, 'benchmark-big.src');
        const bigWorkspace = new LSPWorkspace({
            getContents: (pathname: string) => pathname === bigSrc ? bigText : readFileSync(pathname, 'utf-8')
        });
        bigWorkspace.open(dir);

        const document = bigWorkspace.getDocument(bigSrc);
        document.analyze();

        // `    result := generated_199( result );` -- inside the callee name.
        const position = { line: probeLine, character: 20 };
        expect(document.hover(position)).toBeDefined();
        expect(document.definition(position)).toBeDefined();

        const before = { ...bigWorkspace.profile };
        const results = {
            analyze: time(20, () => { document.analyze(); }),
            hover: time(200, () => { document.hover(position); }),
            definition: time(200, () => { document.definition(position); }),
            completion: time(200, () => { document.completion(position); }),
            tokens: time(200, () => { document.tokens(); }),
            symbols: time(200, () => { document.symbols(); })
        };
        const after = { ...bigWorkspace.profile };

        console.log(`
  large file (${lines.length} lines, ${functions} functions):`);
        for (const [name, perOp] of Object.entries(results)) {
            console.log(`    ${name.padEnd(15)} ${perOp.toFixed(4)} ms/op`);
        }
        console.log(`    ${delta(before, after)}`);

        for (const perOp of Object.values(results)) {
            expect(perOp).toBeGreaterThan(0);
        }
    });

    it('hover, definition, completion, signatureHelp, tokens, symbols', () => {
        text = source;
        const document = workspace.getDocument(src);
        document.analyze();

        // Inside the `helper` call on line 14, columns 19-24. Both are 1-based
        // here: the addon takes the position the way connection.ts hands it
        // over, already offset from LSP's 0-based coordinates. A position that
        // misses a symbol makes every builder bail immediately and the whole
        // benchmark measure nothing.
        const position = { line: 14, character: 21 };

        // Signature help wants a caret inside the argument list, not on the
        // callee, and resolves nothing at column 21.
        const signaturePosition = { line: 14, character: 27 };
        // A position that misses makes every builder bail immediately, which
        // would quietly turn this into a benchmark of nothing.
        expect(document.hover(position)).toBeDefined();
        expect(document.definition(position)).toBeDefined();
        expect(document.signatureHelp(signaturePosition)).toBeDefined();

        const before = { ...workspace.profile };

        const results = {
            hover: time(500, () => { document.hover(position); }),
            definition: time(500, () => { document.definition(position); }),
            completion: time(500, () => { document.completion(position); }),
            signatureHelp: time(500, () => { document.signatureHelp(signaturePosition); }),
            tokens: time(500, () => { document.tokens(); }),
            symbols: time(500, () => { document.symbols(); })
        };

        const after = { ...workspace.profile };

        // These read an already-analyzed tree, so the compiler counters should
        // barely move -- if they do, something is re-compiling per request.
        console.log('\n  per-request (no re-analysis):');
        for (const [name, perOp] of Object.entries(results)) {
            console.log(`    ${name.padEnd(15)} ${perOp.toFixed(4)} ms/op`);
        }
        console.log(`    ${delta(before, after)}`);

        for (const perOp of Object.values(results)) {
            expect(perOp).toBeGreaterThan(0);
        }
    });
});
