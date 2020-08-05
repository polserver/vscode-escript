const NON_ASCII_WHITESPACES = [
    0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
    0x202F, 0x205F,
    0x3000,
    0xFEFF
];
function isWhiteSpace(ch: number) {
    return ch === 0x20 || ch === 0x09 || ch === 0x0B || ch === 0x0C || ch === 0xA0 ||
        ch >= 0x1680 && NON_ASCII_WHITESPACES.indexOf(ch) >= 0;
}

function isDecimalDigit(ch: number) {
    return 0x30 <= ch && ch <= 0x39; // 0..9
}

function isLineTerminator(ch: number) {
    return ch === 0x0A || ch === 0x0D || ch === 0x2028 || ch === 0x2029;
}



type ConfigFile = {
    entries: ConfigEntry[];
}

type ConfigEntry = {
    type: string;
    key: string | number;
    properties: {
        [name: string]: string[] | undefined
    }
}

type EntryProperty = {
    name: string;
    value: string;
}

export class ConfigParser {
    constructor(private input: string) { }

    public parse(): ConfigFile {
        const result: ConfigFile = {
            entries: []
        };

        let line: string | undefined;
        let index = -1;


        const getLine = () => {
            if (index >= this.input.length) {
                return undefined;
            }
            let line = '';
            while (index++ < this.input.length-1) {
                const ch = this.input.charCodeAt(index);
                if (isLineTerminator(ch)) {
                    if (line) { 
                        return line.trim();
                    }
                } else if (!isWhiteSpace(ch) || line) {
                    line += String.fromCharCode(ch);
                }
            }
            return line.trim();
        };
        
        const commentRegex = /^(?:#|\/\/)\s*(.+)/;
        const startEntryRegex = /(\S+)\s+(\S+)(\s+{)?/;
        const propertyRegex = /(\S+)(?:\s+(.+))/;
        let matches: RegExpMatchArray | null = null;

        let inEntry = false;
        let entryType: string | undefined = undefined;
        let entryKey: string | undefined = undefined;
        let properties: EntryProperty[] = [];

        while (line = getLine()) {
            if (matches = line.match(commentRegex)) {
            } else if (!inEntry && !entryType && !entryKey && (matches = line.match(startEntryRegex))) {
                entryType = matches[1].toUpperCase();
                entryKey = matches[2];
                inEntry = Boolean(matches[3]);
            } else if (!inEntry && entryType && entryKey && line === '{') {
                inEntry = true;
            } else if (inEntry && entryKey && entryType) {
                if (line === '}') {
                }
                if ((matches = line.match(propertyRegex))) {
                    properties.push({
                        name: matches[1].toUpperCase(),
                        value: matches[2]
                    });
                } else if (line === '}') {
                    inEntry = false;
                    const num = parseInt(entryKey);
                    const entry: ConfigEntry = {
                        key: isNaN(num) ? entryKey : num,
                        type: entryType,
                        properties: {}
                    };
                    for (const { name, value } of properties) {
                        entry.properties[name] = (entry.properties[name] || []).concat(value);
                    }
                    result.entries.push(entry);
                    properties.length = 0;
                    entryKey = undefined;
                    entryType = undefined;
                }
            }
        }
        return result;
    }
}

