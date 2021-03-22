import { resolve } from 'path';
import { escript } from '..';

describe('vscode-escript-native', () => {
    it('Diagnose POC', () => {
        const moduleDirectory = resolve(__dirname,'..','polserver','pol-core','support','scripts');
        const contents = 'var hello := foobar;';

        const diagnostics = escript.hello(moduleDirectory, contents);

        expect(diagnostics).toEqual([
            {
                range: {
                    start: { line: 1, character: 14 },
                    end: { line: 1, character: 14 }
                },
                severity: 1,
                message: 'Unknown identifier \'foobar\'.'
            }
        ]);
    });
});
