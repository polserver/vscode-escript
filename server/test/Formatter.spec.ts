import { readFileSync } from 'fs';
import { native } from '../../native/src/index';
const { LSPDocument, LSPWorkspace } = native;

const { __debug: { formatAST } } = require('prettier');

import * as util from 'util';
util.inspect.defaultOptions.depth = Infinity;

import { languages, parsers, printers } from '../src/prettier-plugin';

const plugin = {
    languages, parsers, printers
};

describe('prettier-formatter', () => {
    test('foo', async () => {

        const testFormat = (srcname: string, text?: string) => {
            const dir = '/Users/kevineady/UO/ModernDistro/';

            const originalText = text ?? readFileSync(srcname, 'utf-8');

            const getContents = (pathname: string) => {
                if (pathname === srcname) {
                    return originalText;
                }
                return readFileSync(pathname, 'utf-8');
            };

            const workspace = new LSPWorkspace({
                getContents
            });
            workspace.open(dir);

            const document = new LSPDocument(workspace, srcname);

            performance.mark('start');
            const ast = document.toAST();
            performance.mark('end');
            const measure = performance.measure('duration', 'start','end');
            performance.clearMarks('start');
            performance.clearMarks('end');
            performance.clearMeasures('duration');
            return {originalText, ast, measure};
        };



        const srcname = '/Users/kevineady/UO/ModernDistro/pkg/tools/bautool/commands/seer/bautool.src';
        // const srcname = '/Users/kevineady/UO/ModernDistro/scripts/modules/file.em';
        // const text = undefined;
        // const text = '1;';
        const text = `use uo; // line comment

        /* multi
        line
        comment */

        include "foo";`;

        const {ast, originalText} = testFormat(srcname, text);

        const {formatted} = await formatAST(ast, {
            parser: 'escript',
            plugins: [plugin],
            originalText
        });

        console.log(formatted);

    });
});
