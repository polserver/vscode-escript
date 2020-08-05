import { TextDocument, Range, Position } from 'vscode-languageserver';

export function findMatchingParen(doc: TextDocument, position: Position): { close: number, open: number, arg: number } | undefined {
    const str = doc.getText();
    const start = doc.offsetAt(position);
    console.log('start is', str[start]);

    if (str[start - 1] === '(' && str[start] === ')') {
        return { close: start, open: start - 1, arg: 0 };
    }



    const open = (() => {
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
            } else if (c === ',' && counter === 1) {
                argCount++;
            }
        }
        return { index: openPos, arg: argCount };
    })();

    const close = (() => {
        let closePos = str[start] === ')' && str[start - 1] === ',' ? start - 1 : start;
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

    if (!open || !close) { return console.log(`No index ${open} ${close}`), undefined; }

    console.log(`range is '${str.substring(open.index, close + 1)}' in arg ${open.arg}`);
    return { open: open.index, arg: open.arg, close };
}


export function getEndPos(str: string): { line: number, character: number } {
    let line = 1, character = 1;
    --line;
    for (let i = 0; i < str.length - 1; i++) {
        if (str[i] === '\r' && str[i + 1] === '\n') { ++line, character = 1; }
        else if (str[i] === '\r') { ++line, character = 1; }
        else if (str[i] === '\n') { ++line, character = 1; }
        else { ++character; }
    }
    ++character;
    return { line, character };
}
/**
 * https://gist.github.com/alexanderby/e29d9038c834febc429f3e0abc88a011
 * Creates a deep copy of an object resolving
 * cyclic references, constructors, property descriptors.
 */
export function deepClone<T extends object>(src: T, refs = new WeakMap()): T {
    if (typeof src !== 'object' || src === null) {
        return src;
    }
    if (refs.has(src)) {
        return refs.get(src);
    }
    var result: any;
    if (Array.isArray(src)) {
        result = [];
        refs.set(src, result);
        src.forEach(function (d) {
            result.push(deepClone(d, refs));
        });
    } else if (src instanceof Date) {
        result = new Date(src.getTime());
        refs.set(src, result);
    } else if (src instanceof String || src instanceof Boolean || src instanceof Number) {
        let Ctor = Object.getPrototypeOf(src).constructor;
        result = new Ctor(src);
        refs.set(src, result);
    } else {
        let Ctor = Object.getPrototypeOf(src).constructor;
        result = new Ctor();
        refs.set(src, result);
        Object.setPrototypeOf(result, Object.getPrototypeOf(src));
        var props = Object.getOwnPropertyNames(src);
        for (var i = 0, dtor, len = props.length; i < len; i++) {
            dtor = Object.getOwnPropertyDescriptor(src, props[i]);
            if (dtor) {
                if ('value' in dtor) {
                    dtor.value = deepClone(dtor.value, refs);
                }
                Object.defineProperty(result, props[i], dtor);
            }
        }
    }
    return result;
}

export function containsPosition(range: Range, position: Position): boolean {
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
}
