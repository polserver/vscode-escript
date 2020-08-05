import { EscriptLexer } from 'escript-antlr4';
import { ANTLRInputStream, CommonTokenStream, ProxyParserErrorListener } from 'antlr4ts';
import { EscriptSymbolBuilder } from './parser';
import CaseChangingStream from './case-changer';
import { promises as fsp } from 'fs';
import { inspect } from 'util';
import { TextDocument, Position, Range, PublishDiagnosticsParams } from 'vscode-languageserver';
import { EscriptWorkspacePathDetails } from './workspace';
import * as doctrine from 'doctrine';
import { ConfigParser } from './config-parser';
import { EscriptLooseParser, ModuleUnitContext, CompilationUnitContext } from 'escript-antlr4/lib/antlr/EscriptLooseParser';
import distroSources from './distro-sources';

inspect.defaultOptions.depth = Infinity;
// inspect.defaultOptions.colors = false;

const containsPosition = (range: Range, position: Position): boolean => {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
        return false;
    }
    return true;
};

const time = async<T>(label: string, cb: () => Promise<T> | T) => {
    const start = Date.now();
    try {
        const ret = await cb();
        return ret;
    } catch (e) {
        console.error(`Error:`, e);
    } finally {
        const end = Date.now();
        console.log(`${label}: Completed in ${end - start}ms`);
    }
};

void async function rawparse() {
    let uri = '/Users/kevineady/Documents/Projects/ModernDistro/pkg/skills/fishing/fishing.src';

    await time('EscriptParser.compilationUnit input file', async () => {
        const program = await fsp.readFile(uri, 'utf-8');
        const inputStream = new ANTLRInputStream(program);
        const lexer = new EscriptLexer(new CaseChangingStream('abc', inputStream, false));
        const tokenStream = new CommonTokenStream(lexer);
        const parser = new EscriptLooseParser(tokenStream);
        const tree = parser.compilationUnit();
    });
};

void async function main() {
    let uri: string;
    uri = 'file:///Users/kevineady/Documents/Projects/ModernDistro/pkg/items/bulletinBoard/bulletin_board_reply.src';
    // uri = '/tmp/joined.src';

    if (!uri.startsWith('file://')) { uri = `file://${uri}`; }


    const workspace = await time('EscriptSymbolBuilder.create', async () => {
        console.log('starting');
        const workspace = EscriptWorkspacePathDetails.find(uri);
        console.log('Done!');
        return workspace;
    });

    const pos = { line: 8, character: 40 }; // for healstone

    if (workspace) {
        await workspace.initFindTypes();
    }
};

void async function main() {

    const workspace = await time('Workspace.find', () => {
        return EscriptWorkspacePathDetails.find('file:///Users/kevineady/Documents/Projects/ModernDistro/', { types: true });
    });

    if (!workspace) {
        return;
    }

    await time('Workspace.types', () => {
        return workspace.waitForTypes();
    });

    const first = 'file:///Users/kevineady/Documents/Projects/ModernDistro/pkg/tools/bautool/commands/seer/bautool.src'; // 'file:///Users/kevineady/Documents/Projects/ModernDistro/pkg/skills/spellweaving/spells/summonFiend.src';
    const allErrors: [string, PublishDiagnosticsParams][] = [];
    for (let i = distroSources.indexOf(first); i < distroSources.length; ++i) {
        let uri = distroSources[i];

        if (!uri.startsWith('file://')) { uri = `file://${uri}`; }

        const builder = await time('EscriptSymbolBuilder.create', async () => {
            // const workspace =EscriptWorkspacePathDetails.find(uri);
            const it = await EscriptSymbolBuilder.create(uri, { cache: false });
            return it;
        });

        if (builder instanceof EscriptSymbolBuilder) {
            const diags = builder.getDiagnostics();
            const builders = Array.from(EscriptSymbolBuilder.map.keys());
            if (diags.diagnostics.length) {
                console.error(uri, diags);
                allErrors.push([uri, diags]);
            }
            if (builders.length || Object.entries(EscriptSymbolBuilder.sourceResults).length) {
                console.log(builders);
                console.log(EscriptSymbolBuilder.sourceResults);
                break;
            }
            console.log(`Completed ${i}/${distroSources.length} (${(i / distroSources.length * 100)}%)`);
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            break;
        }
        break;
    }
    console.error(`ALL ERRORS`, allErrors);

}();

void function main2() {
    function foo(a: any, b?: any, c?: any, d?: any, e?: any, f?: any) {

    }

    function bar(a: any, b?: any, c?: any, d?: any, e?: any, f?: any) {

    }

    function baz(a: any, b?: any, c?: any, d?: any, e?: any, f?: any) {

    }

    let str = TextDocument.create('inmemory://empty', 'plaintext', 0, `    foo(1, 2, 3,
        bar(3, 3 , foo(1, 2, 3,
            bar(3 , 3, 4 , 5,),
            baz(1, (3), 
                4, 1,)
        ), 5),
        baz(1, 3, 4, 1)
    );`);

    foo(1, 2, 3,
        bar(3, 3, foo(1, 2, 3,
            bar(3, 3, 4, 5),
            baz(1, (3),
                4, 1)
        ), 5),
        baz(1, 3, 4, 1)
    );

    // public int findClosingParen(char[] text, int openPos) {

    // }
    function findMatchingParen(doc: TextDocument, position: Position) {
        const str = doc.getText();
        const start = doc.offsetAt(position);
        console.log('start is', str[start]);

        const closeIndex = (() => {
            let closePos = start;
            let counter = 1;
            while (counter > 0) {
                const c = str[++closePos];
                if (c === undefined) { return undefined; }
                if (c === '(') {
                    counter++;
                }
                else if (c === ')') {
                    counter--;
                }
            }
            return closePos;
        })();

        const openIndex = (() => {
            let openPos = start;
            let counter = 1;
            let argCount = 0;
            while (counter > 0) {
                const c = str[--openPos];
                if (c === undefined) { return undefined; }
                if (c === '(') {
                    counter--;
                }
                else if (c === ')') {
                    counter++;
                } else if (c === ',') {
                    argCount++;
                }
            }
            return { index: openPos, arg: argCount };
        })();
        // console.log('closeindex', closeIndex);
        // console.log(`char is '${str[closeIndex]} ${inspect(doc.positionAt(closeIndex))}'`);
        if (!openIndex || !closeIndex) { return console.log(`No index ${openIndex} ${closeIndex}`); }

        console.log(`range is '${str.substring(openIndex.index, closeIndex + 1)}' in arg ${openIndex.arg}`);
    }

    findMatchingParen(str, { line: 0, character: 10 });

    findMatchingParen(str, { line: 1, character: 11 });
};

void function main() {

    type Scope = {
        location: {
            uri?: string;
            range: Range;
        }
        children: Scope[],
        id: string
        toString: () => any;
    }
    const Scope = {
        create: (id: string, range: Range, children?: Scope[]): Scope => {
            return { id, location: { range }, children: children ?? [], toString() { return this.id; } };
        }
    };
    const seq = '    (    (    (    (    (    )    )    )    (    (    (    )    )    )    (    )    )    )    ';
    const tok = ' a    a    a    a    a    a    a    a    a    a    a    a    a    a    a    a    a    a    a  ';
    // const tok = ' a    b     c    d   c   b   a  '+'A   B    C    D   C   B   A  '; \
    // const tok = seq.replace(/(\s+)|\(|\)/g, (str) => str === '(' ? ' ' : str === ')' ? ' ' : `${'a'.padStart(str.length/2).padEnd(str.length)}`);
    // const tok = 'a ( a  (a  ( a  (a  ( a  )a  )a  ) a   ( a  (a  ( a  )a  )a  )   a     ( a  )a  )a  ) a  ';
    let starts: number[] = [];
    const globalScope = Scope.create('GLOBAL', Range.create(Position.create(0, 0), Position.create(0, seq.length)));

    {
        let currentScope = [globalScope];
        [...seq].forEach((chr, i) => {
            console.log(chr, i);
            if (chr === '(') {
                starts.push(i);
                currentScope.push(Scope.create('!', Range.create(Position.create(0, i), Position.create(0, Infinity))));
            } else if (chr === ')') {
                debugger;
                currentScope[currentScope.length - 1].location.range.end.character = i;
                const newid = seq.substring(starts[starts.length - 1], i + 1);
                currentScope[currentScope.length - 1].id = newid;
                console.log('newid', newid);
                currentScope[currentScope.length - 2].children.push(currentScope[currentScope.length - 1]);
                starts.pop();
                currentScope.pop();
            }
        });
    }

    type Token = {
        line: number;
        charPositionInLine: number;
        text: string;
    };
    let x = [...tok].reduce((prev, cur, index) => cur !== ' ' && prev.concat({ line: 0, charPositionInLine: index + 1, text: cur }) || prev, [] as Token[]);

    console.log((globalScope.toString()));
    let currentScope = [globalScope];
    const scopeIndex: number[] = [0];
    for (const token of x) {
        const tokPos = { line: token.line, character: token.charPositionInLine };
        do {
            const child = currentScope[currentScope.length - 1].children[scopeIndex[scopeIndex.length - 1]];
            if (!child) { break; }

            if (containsPosition(child.location.range, tokPos)) {
                scopeIndex.push(0);
                currentScope.push(child);
            } else {
                break;
            }
        } while (true);

        do {
            if (!containsPosition(currentScope[currentScope.length - 1].location.range, tokPos)) {
                debugger;
                if (scopeIndex.length === 0) {
                    throw new Error(`HMMM no scopeIndex!`);
                }
                else if (currentScope.length === 0) {
                    throw new Error(`HMMM no currentScope!`);
                }
                while (scopeIndex[scopeIndex.length - 1] >= currentScope[currentScope.length - 1].children.length) {
                    scopeIndex.pop();
                    currentScope.pop();
                    if (containsPosition(currentScope[currentScope.length - 1].location.range, tokPos)) {
                        break;
                    }
                }
                scopeIndex[scopeIndex.length - 1]++;
                {
                    // currentScope.push(currentScope[currentScope.length-1].children[scopeIndex[scopeIndex.length-1]]);
                    // scopeIndex.push(0);
                    continue;
                }
            } else {
                break;
            }
        } while (true);
        console.log('token', token.text, 'is in', currentScope[currentScope.length - 1].toString());
        // break;
    }
};


void async function main() {

    const uri = 'file:///Users/kevineady/Documents/Projects/ModernDistro/pkg/skills/fishing/fishing.src';
    const workspace = await EscriptWorkspacePathDetails.find(uri);
    if (workspace) {
        [':se'].forEach(p => {
            console.log(workspace.toCompletionItems(p));
        });
        // console.log(workspace);
    }
};

void async function main() {
    let str = 
`/**
    * Returns the substring of 'string' beginning at 'start' for 'length'. This
    * functions the same as virtual Substrings within eScript such as String[4,6]
    *
    * @param:
    *          -  str {*} The string to search within
  *         -     start {*} The index to start getting the substring from
       *  -       length           {*}           The length of the substring
    */`;

    str = `/**
    * If commit is 0 then drops the not committed custom house changes or accept them instead
    *
    * @method House.acceptcommit
    *
    * @param:
    * - chr {Character}
    * - commit {Long} true/false
    *
    * @returns {Long} true
    *
    * @error:
    * - Error Message
    */`;
    const results = doctrine.parse(str, { unwrap: true, lineNumbers: true, preserveWhitespace: true });
    // const params = results.tags.reduce((p, c) => (c.title === 'param' && c.name && c.type) ? { ...p, [c.name]: c.type } : p, {} as { [x: string]: doctrine.Type });

    console.log(results);

};


import ASTVisitor, { ImportResolver } from './grammars/ast-visitor';
import { getEndPos } from './utils';
import { pathToFileURL } from 'url';
import EscriptParserVisitorImpl from './grammars/EscriptParserVisitorImpl';
import { extname } from 'path';
import { AbstractParseTreeVisitor, ParseTree, RuleNode } from 'antlr4ts/tree';

void async function main(filename: string) {
    // let filename: string;
    // filename = '/Users/kevineady/Documents/Projects/ModernDistro/pkg/skills/fishing/fishing.src';
    // filename = ;
    const uri = pathToFileURL(filename).toString();
    const isModuleParse = extname(filename).toLowerCase() === '.em';
    const program = await fsp.readFile(filename, 'utf-8');
    const tree = await time(`EscriptParser.${isModuleParse ? 'moduleUnit' : 'compilationUnit'}`, async () => {
        const inputStream = new ANTLRInputStream(program);
        const lexer = new EscriptLexer(new CaseChangingStream('abc', inputStream, false));
        const tokens = new CommonTokenStream(lexer);
        const parser = new EscriptLooseParser(tokens);
        if (isModuleParse) {
            return [tokens, parser.moduleUnit()] as [CommonTokenStream, ModuleUnitContext];
        } else {
            return [tokens, parser.compilationUnit()] as [CommonTokenStream, CompilationUnitContext];
        }
    });
    if (!tree) { return; }

    const ast = await time('EscriptParserVisitorImpl.visit', () => {
        return new EscriptParserVisitorImpl(uri, tree[0]).visit(tree[1]);
    });

    if (!ast) { return; }

    // const importResolver: ASTImportResolver = async (from: Set<string>, importKind: string, what: string) => {
    //     try {
    //         const res = await main(what);
    //         return res ?? new Error(`Could not find ${what}`); 
    //     } catch {
    //         return new Error(`Could not find ${what}`);
    //     }
    // };
    // const astVisit = await time('ASTVisitor.visit', async () => {
    //     const visitor = new ASTVisitor(uri, new Set(uri), importResolver);
    //     return visitor.visit2(Array.isArray(ast) ? ast[0] : ast, filename.endsWith('.src'));
    // });
    // if (!astVisit) { return; }

    // console.log('astVisit', astVisit.scope);

    // for (let i = 1; i < 35; i++) {
    //     console.log(i,'scope is', astVisit.scope.walkScope({line:14,character:14})?.scope.location);
    //     break;
    // }
    // // console.log(i,'scope is', astVisit.scope.walkScope({line:5,character:0})?.location);

    // return astVisit;
}; // ('/Users/kevineady/Documents/Projects/ModernDistro/scripts/start.src').catch(e => (console.error(e), process.exit(1)));
// }('/Users/kevineady/Documents/Projects/SimpleDistro/scripts/modules/basicio.em').catch(e => (console.error(e), process.exit(1)));

// '/Users/kevineady/Documents/Projects/ModernDistro/pkg/skills/fishing/fishing.src';


void function main() {

    let str = `/**
    * The base {@link UO} (Object) class
    *
    * @member:
    * - color {Long} (rw) color value (0 to 0xFFF) 
    *
    * @method:
    * - eraseprop {(propname: String): Long | error} Erases the property named 'propname'.
    */`;

    let str3 = `/**
    * The base {@link UO} (Object) class
    *
    * @member:
    * - color {Long} (rw) color value (0 to 0xFFF) 
    * - dirty {Long} (ro) This is set when anything on the object changes, and cleared on world save   
    * - facing {Long} (rw) facing or the object (meaningful for mobiles and light-emitting items) range 0-127  
    * - graphic {Long} (rw) art id number  
    * - height {Long} (ro) height of the graphic as defined in tiledata.mul    
    * - multi {Multi} (ro) MultiRef for the Multi the object is on 
    * - name {String} (rw) name string (for items use .desc for single-click text, this does not include suffix or
    *   formatting) 
    * - objtype {Long} (ro) object type as defined in itemdesc.cfg 
    * - realm {String} (ro) case-sensitive name of the realm   
    * - serial {Long} (ro) unique object identifier    
    * - specific_name {Long} (ro) Set if a specific name is set, otherwise like itemdesc name false.   
    * - weight {Integer} (ro) weight of the graphic as defined in tiledata.mul 
    * - x {Integer} (ro) x coordinate  
    * - y {Integer} (ro) y coordinate  
    * - z {Integer} (ro) z coordinate  
    *
    * @method:
    * - eraseprop {(propname: String): Long | error} Erases the property named 'propname'.
    * - get_member {(membername: String): *} Gets the value of the built-in member 'membername'. var objname :=
    *   obj.get_member("name") is the same as var objname := obj.name
    * - getprop {(propname: String): *} Returns an unpacked script object (i.e. int,string,array,etc)
    * - isa {(class: Long): Long} True if the derived class is the same as the passed class type (see uo.em for all
    *   constants)
    * - propnames {(): String[]} Returns an array of property name strings.
    * - set_member {(membername: String, value: *): *} Sets the built-in member 'membername' to 'value'.
    *   obj.set_member("name","Eric") is the same as obj.name := "Eric"
    * - setprop {(proppname: String, propval: *): Long | error} Sets a packable object to a property.
    */`;

    let str2 = `/**
    * The base {@link UO} Object class
    *
    * @member {Long} color (rw) color value (0 to 0xFFF)	
    * @member {Long} dirty (ro) This is set when anything on the object changes, and cleared on world save	
    * @member {Long} facing (rw) facing or the object (meaningful for mobiles and light-emitting items) range 0-127	
    * @member {Long} graphic (rw) art id number	
    * @member {Long} height (ro) height of the graphic as defined in tiledata.mul	
    * @member {Multi} multi (ro) MultiRef for the Multi the object is on	
    * @member {String} name (rw) name string (for items use .desc for single-click text, this does not include suffix or formatting)	
    * @member {Long} objtype (ro) object type as defined in itemdesc.cfg	
    * @member {String} realm (ro) case-sensitive name of the realm	
    * @member {Long} serial (ro) unique object identifier	
    * @member {Long} specific_name (ro) Set if a specific name is set, otherwise like itemdesc name false.	
    * @member {Integer} weight (ro) weight of the graphic as defined in tiledata.mul	
    * @member {Integer} x (ro) x coordinate	
    * @member {Integer} y (ro) y coordinate	
    * @member {Integer} z (ro) z coordinate	
    * @method {(): Long | error} eraseprop Erases the property named 'propname'.
    * @method {(membername: String): *} get_member Gets the value of the built-in member 'membername'. var objname := obj.get_member("name") is the same as var objname := obj.name
    * @method {(propname: String): *} getprop Returns an unpacked script object (i.e. int,string,array,etc)
    * @method {(class: Long): Long} isa True if the derived class is the same as the passed class type (see uo.em for all constants)
    * @method {(): String[]} propnames Returns an array of property name strings.
    * @method {(membername: String, value: *): *} set_member Sets the built-in member 'membername' to 'value'. obj.set_member("name","Eric") is the same as obj.name := "Eric"
    * @method {(proppname: String, propval: *): Long | error} setprop Sets a packable object to a property.
    */`;


    let sstrs = `/**
    * Can be used in 3 overloaded ways. Returns 1 on compare success. Index is a
    * starting position to begin the compare in the string, and length is the
    * length to compare from the index. When using the 3rd method, you can compare
    * substrings in both strings instead of just the substring of string1 to entire
    * string2.
    *
    * @param:
    * - str1 {any} First string to compare
    * - str2 {any} Second string to compare
    * - pos1_start {any} The index to start from first string
    * - pos1_end {any} The index to end from first string
    * - pos2_start {any} The index to start from second string
    * - pos2_end {any} The index to end from second string
    *
    * @example
    * Compare(string1, string2)
    * Compare(string1, string2, string1_index, string1_length)
    * Compare(string1, string2, string1_index, string1_length, string2_index, string2_length)
    */`;

    const sstr = `/** @type {*} 
    * @type {{}} */`;

    const parsed = doctrine.parse(sstr, { unwrap: true });
    console.log('parsed', parsed);
};

void function main() {
    const cfg = `Dessert 0x123
    {
        Cost 8
        Calories 1004
        MadeLike   grandma
        Ingredient flour
        Ingredient butter
        Ingredient apples
        Deliciousness 3.6
        Description very long description      here
    }
    Dessert appliepie
    {
        Cost 8
        Calories 1004
        MadeLike   grandma
        Ingredient flour
        Ingredient butter
        Ingredient apples
        Deliciousness 3.6
        Description very long description      here
    }`;
    const x = new ConfigParser(cfg);
    console.log(x.parse());
};