import { Location, Range, SymbolKind, SymbolInformation, Position, DocumentSymbol, DefinitionLink, CompletionItemKind, SignatureHelp, CompletionItem, ParameterInformation, SignatureInformation, Hover, MarkedString, MarkupContent } from 'vscode-languageserver';
import { fileURLToPath } from 'url';
import * as doctrine from 'doctrine';
import { deepClone, containsPosition } from './utils';
import { EscriptWorkspacePathDetails } from './workspace';

export class SymbolDefinedError extends Error {
    constructor(private symName: string, private location?: Location) {
        super(`Symbol ${symName} already defined${location ? ` at ${location.uri}:${location.range.start.line}:${location.range.start.character}` : ``}`);
        debugger;
    }
    public getName() {
        return this.symName;
    }
    public getLocation() {
        return this.location;
    }
}

export type MemberProperty = { type: 'member', name: string, impl: string, sym: Sym | undefined, tag: doctrine.Tag };
export type MethodProperty = { type: 'method', name: string, impl: string, location: Location, sym: Sym | undefined, anno: doctrine.Annotation, tag: doctrine.Tag };
export type ExportedProperty = { type: 'exported', name: string, sym: Sym, impl: string };
export type TypeProperties = {
    members: MemberProperty[],
    methods: (MethodProperty | ExportedProperty)[];
};
export class Scope {
    symbols: Map<string, Sym> = new Map();
    labels: Map<string, Sym> = new Map();
    types: Map<string, Sym> = new Map();
    children: Scope[] = [];

    constructor(public location: Location, enclosingScope?: Scope) {
        if (enclosingScope) {
            enclosingScope.children.push(this);
        }
    }

    public toJSON() {
        return {
            location: this.location,
            symbols: [...this.symbols],
            labels: [...this.labels],
            types: [...this.types],
            children: this.children
        };
    }

    define(sym: Sym) {
        const map = sym.getType() === SymType.LABEL ? this.labels : sym.getType() === SymType.TYPEDEF ? this.types : this.symbols;
        const symbolName = sym.getName();
        const defined = map.get(symbolName);
        if (defined) {
            throw new SymbolDefinedError(symbolName, defined.toLocation());
        }
        map.set(symbolName, sym);
        return sym;
    }

    locals() {
        return Array.from(this.symbols.entries());
    }

    resolve(name: string, type = SymbolMapType.SYMBOLS): Sym | undefined {
        const map = type === SymbolMapType.LABELS ? this.labels : type === SymbolMapType.TYPES ? this.types : this.symbols;
        return map.get(name.toLowerCase());
    }

    getEnclosingScope() {
        return undefined;// this.enclosingScope;
    }

    walkScope(where: Position, what: undefined, map: SymbolMapType, cb: (sym: Scope) => any): undefined;

    walkScope(where: Position, what: string, map?: SymbolMapType, cb?: (sym: Scope) => any): Sym | undefined;
    walkScope(where: Position): { scope: Scope, symbols: Sym[][] } | undefined;

    walkScope(where: Position, what?: string, map: SymbolMapType = SymbolMapType.SYMBOLS, cb?: (sym: Scope) => any): { scope: Scope, symbols: Sym[][] } | Sym | undefined {
        let sym: Sym | undefined = undefined;
        let symbols: Sym[][] = [];

        if (!containsPosition(this.location.range, where)) {
            return undefined;
        }

        let scope: Scope = this;
        outer:
        do {
            if (cb) {
                cb(scope);
            }
            if (what === undefined) {
                if (!cb) {
                    symbols.unshift([...scope.symbols.values()]);
                }
            } else {
                sym = scope.resolve(what, map) ?? sym;
            }
            for (const child of scope.children) {
                if (containsPosition(child.location.range, where)) {
                    scope = child;
                    continue outer;
                }
            }
            break;
        } while (true);

        return what === undefined ? cb === undefined ? undefined : { scope, symbols } : sym;
    }

    static getObjectName(object: string | doctrine.Type | undefined | null): { objectName: string, application?: string | number } {
        if (typeof object === 'string') {
            return { objectName: object };
        } else if (object) {
            switch (object.type) {
            case 'NameExpression': return { objectName: object.name };
            case 'StringLiteralType': return { objectName: object.value };
            case 'TypeApplication': {
                if (object.expression.type === 'NameExpression') {
                    const { applications: apps } = object;
                    if (apps.length) {
                        if ( apps[0].type === 'StringLiteralType' || apps[0].type === 'NumericLiteralType') {
                            return { objectName: object.expression.name, application: apps[0].value };
                        }
                    }
                    return { objectName: object.expression.name };
                }
            }
            }

        }
        return { objectName: '*' };
    }

    static findTypeProperty(scopes: Scope[], objectName: string, propName: string, workspace?: EscriptWorkspacePathDetails | null, index?: number): MemberProperty | MethodProperty | null;
    static findTypeProperty(scopes: Scope[], type: doctrine.Type | undefined | null, propName: string, workspace?: EscriptWorkspacePathDetails | null, index?: number): MemberProperty | MethodProperty | null;


    static findTypeProperty(scopes: Scope[], object: string | doctrine.Type | undefined | null, propName: string, workspace?: EscriptWorkspacePathDetails | null, index: number = scopes.length - 1): MemberProperty | MethodProperty | null {
        let scope: Scope | undefined = undefined;

        const { objectName, application } = this.getObjectName(object);

        while ((scope = scopes[index--])) {
            let resolved: Sym | undefined;
            const syms = objectName === '*' ? Array.from(scope.types.values()) : (resolved = scope.resolve(objectName, SymbolMapType.TYPES), resolved ? [resolved] : []);
            for (const sym of syms) {
                const tag = sym.getParamTag(propName);
                let parentType: doctrine.Type | undefined;
                let method: ReturnType<Sym['getMethod']>;
                if (tag) {
                    return {
                        type: 'member',
                        name: propName,
                        impl: sym.getCasedName(),
                        sym,
                        tag,
                    };
                }
                else if (objectName !== '*' && (parentType = sym.getAnnoType()) && parentType.type === 'NameExpression') {
                    return this.findTypeProperty(scopes, parentType.name, propName, workspace, index + 1);
                }
                else if ((method = sym.getMethod(propName))) {
                    const { anno, location, tag } = method;
                    return {
                        type: 'method',
                        name: propName,
                        impl: sym.getCasedName(),
                        sym,
                        anno,
                        location,
                        tag
                    };
                }
            }
        }
        return null;
    }

    static findTypeProperties(scopes: Scope[], objectName: string, prefix: string, workspace?: EscriptWorkspacePathDetails | null, index?: number, objs?: Set<string>): TypeProperties;
    static findTypeProperties(scopes: Scope[], type: doctrine.Type | undefined | null, prefix: string, workspace?: EscriptWorkspacePathDetails | null, index?: number, objs?: Set<string>): TypeProperties;

    static findTypeProperties(scopes: Scope[], object: string | doctrine.Type | undefined | null, prefix: string, workspace?: EscriptWorkspacePathDetails | null, index: number = scopes.length - 1, objs: Set<string> = new Set()): TypeProperties {
        prefix = prefix.toLowerCase();
        let scope: Scope | undefined = undefined;

        const typedef: TypeProperties = {
            members: [],
            methods: []
        };

        const { objectName, application } = this.getObjectName(object);

        if (index === 0 && workspace) {
            const parent = workspace.findMethods(objectName, application);
            typedef.methods = parent.reduce((p,c) => (c.sym.getName().startsWith(prefix) ? [...p, c] : p), typedef.methods);
        }
        while ((scope = scopes[index--])) {
            let resolved: Sym | undefined;
            const syms = objectName === '*' ? Array.from(scope.types.values()) : (resolved = scope.resolve(objectName, SymbolMapType.TYPES), resolved ? [resolved] : []);
            for (const sym of syms) {
                const symName = sym.getName();
                if (!objs.has(symName)) {
                    objs.add(symName);
                    const tags = sym.findParamTags(prefix);
                    for (const tag of tags) {
                        if (tag.name) {
                            typedef.members.push({
                                type: 'member',
                                name: tag.name.id,
                                impl: sym.getCasedName(),
                                sym,
                                tag,
                            });
                        }
                    }
                    const methods = sym.findMethods(prefix);
                    for (const { anno, name, tag, location } of methods) {
                        typedef.methods.push({
                            type: 'method',
                            name,
                            impl: sym.getCasedName(),
                            sym,
                            location,
                            tag,
                            anno
                        });
                    }
                    const parentType = sym.getAnnoType();
                    if (parentType?.type === 'NameExpression') {
                        const name = parentType.name.toLowerCase();
                        if (!objs.has(name)) {
                            const parent = this.findTypeProperties(scopes, parentType.name, prefix, workspace, index + 1, objs);
                            if (parent) {
                                typedef.members.push(...parent.members);
                                typedef.methods.push(...parent.methods);
                            }
                        }
                    }
                }

            }
        }
        return typedef;
    }

    static toSignatureHelp(funcName: string, methods: (MethodProperty | ExportedProperty)[], currentArg: number): SignatureHelp | null {
        // const x = SignatureHelp
        // throw new Error('Method not implemented.');
        // console.log('get signature help for', tag);
        const signatures: SignatureInformation[] = [];

  

        for (const method of methods) {
            const parameters: ParameterInformation[] = [];
            let signatureLabel = `${method.impl}.${funcName}(`;
            if (method.type === 'exported') {
                // Array.from(this.childScope?.symbols || []).forEach(([name, sym], index, arr) => {
                method.sym.args?.forEach(( { symbol }, index, arr) => {
                // tag.type.params.forEach(
                    // this.children?.forEach((child, index, arr) => {
                    if (index === 0) { 
                        return;
                    }

                    // const { symbol, required } = child;
                    const name = symbol.getCasedName();
                    
                    const label = `${name}${Sym.toTypePostfix(symbol.getAnnoType())}`;
                    parameters.push(
                        ParameterInformation.create([signatureLabel.length, signatureLabel.length + label.length], undefined)
                    );
                    signatureLabel += label + (index === arr.length - 1 ? '' : ', ');
                });
                signatureLabel += ')';
                signatureLabel += Sym.toTypePostfix(method.sym.getAnnoReturns());

                let description = method.sym.getAnnotation()?.description;
                // if (!description) {
                //     description = `${method.impl}`;
                // }
                signatures.push(
                    SignatureInformation.create(signatureLabel, description, ...parameters)
                );
            } else {
                // const funcName = this.getCasedName();
                const parameters: ParameterInformation[] = [];
                let signatureLabel = `${method.tag.name?.id ?? method.name}(`;
                // Array.from(this.childScope?.symbols || []).forEach(([name, sym], index, arr) => {
                // method.anno.tags
                let returns: string = '';
                let putParam = false;
                method.anno.tags.forEach(tag => {
                    if (tag.title === 'param' && tag.name) {
                        const label = `${tag.name.id}${Sym.toTypePostfix(tag.type)}${tag.modifier && 'optional' in tag.modifier ? '?' : ''}`;
                        parameters.push(
                            ParameterInformation.create([signatureLabel.length + (putParam ? 2 : 0), signatureLabel.length + label.length + (putParam ? 2 : 0)], tag.description ?? undefined)
                        );
                        signatureLabel += (putParam ? ', ' : '') + label;
                        putParam = true;
                    } else if (tag.title === 'returns') {
                        returns = Sym.toTypePostfix(tag.type);
                    }
                });
                signatureLabel += ')';
                signatureLabel += returns;

                signatures.push(
                    SignatureInformation.create(signatureLabel, method.tag.description ?? undefined, ...parameters)
                );
            }
        }
        const result: SignatureHelp = {
            signatures,
            activeParameter: currentArg,
            activeSignature: 0
        };
        console.error('sig help is', result);
        return result;
    }


}

export enum SymType {
    VARIABLE,
    FUNCTION,
    EXPORTED_FUNCTION,
    MODULE_FUNCTION,
    PROGRAM,
    CONSTANT,
    ENUM_CONSTANT,
    NAMESPACE,
    FUNCTION_ARGUMENT,
    PROGRAM_ARGUMENT,
    LABEL,
    TYPEDEF
}
export enum SymbolMapType {
    SYMBOLS,
    LABELS,
    TYPES
}

function typeToString(type?: doctrine.Type | null): string {
    if (!type) {
        return 'any';
    } else if (type.type === 'NameExpression') {
        return type.name;
    } else if (type.type === 'UnionType') {
        return type.elements.map(e => typeToString(e)).join(' | ');
    }
    return 'any';
}

export type MethodDefinition = { 
    name: string;
    location: Location, 
    anno: doctrine.Annotation
    tag: doctrine.Tag
};
export class Sym {
    // constructor(private name: string, private type: SymType, private uri: string, private line: number, private col: number, private end: number, private childScope?: Scope) {
    // }
    private name: string;
    private casedName: string;
    private location: Location;
    private type: SymType;
    private annotation?: doctrine.Annotation;
    private annoType?: doctrine.Type;
    private annoReturns?: doctrine.Type;
    private children?: ({ symbol: Sym, required: boolean })[];
    private methods?: { [name: string]: MethodDefinition };

    private paramToTag?: { [param: string]: doctrine.Tag };
    // private argCount?:[number, number];

    constructor();
    constructor(casedName: string, type: SymType, location: Location, annotation?: doctrine.Annotation);

    constructor(casedName?: string, type?: SymType, location?: Location, annotation?: doctrine.Annotation) {
        if (casedName !== undefined && type !== undefined && location !== undefined) {
            this.casedName = casedName;
            this.name = casedName.toLowerCase();
            this.type = type;
            this.location = location;

            if (annotation) {
                this.updateAnnotation(location, annotation);
            }
        }
        if (type === SymType.FUNCTION) {
            this.children = [];
        }
    }

    public updateAnnotation(location: Location, annotation: doctrine.Annotation) {
        this.annotation = annotation;
        this.location = location;

        /** @TODO we do two loops here... */

        this.paramToTag = annotation.tags.reduce(
            (p, c) => (
                (c.title === 'param' || c.title === 'method' || c.title === 'member') && c.name) ?
                { ...p, [c.name.id.toLowerCase()]: c }
                : p
            , {} as { [x: string]: doctrine.Tag }
        );

        // const tag = annotation.tags.find(tag => tag.title === 'type' && tag.type);
        // if (tag && tag.type) {
        //     this.annoType = tag.type;
        // }
        for (const tag of annotation.tags) {
            if (tag.type) {
                if (tag.title === 'type') {
                    this.annoType = tag.type;
                } else if (tag.title === 'returns') {
                    this.annoReturns = tag.type;
                }
            }
        }
    }

    public addArg(symbol: Sym, required: boolean) {
        const entry = { symbol: symbol?.clone(), required };
        if (!this.children) {
            this.children = [entry];
        } else {
            this.children.push(entry);
        }
    }
    public addMethod(name: string, location: Location, anno: doctrine.Annotation) {
        this.methods = this.methods ?? {};
        if (name in this.methods) {
            throw new SymbolDefinedError(name);
        }
        const tag = anno.tags.find(tag => tag.title === 'method');
        if (tag) {
            this.methods[name] = { name, location, anno, tag };
        }

    }

    public getMethod(name: string): MethodDefinition | undefined {

        if (this.methods && name in this.methods) {
            return this.methods[name];
        }
    }

    public getArgCount() {
        return this.children?.length ?? 0;
    }

    public get args() {
        return this.children;
    }

    public clone() {
        return this; // deepClone<Sym>(this);
    }

    public getCasedName() {
        return this.casedName;
    }

    public getName() {
        return this.name;
    }
    public getType() {
        return this.type;
    }

    public getAnnoType() {
        return this.annoType;
    }

    public getAnnoReturns() {
        return this.annoReturns;
    }

    public setAnnoType(type: doctrine.Type) {
        this.annoType = type;
    }

    public getAnnotation() {
        return this.annotation;
    }

    public getTypeName(): string {
        switch (this.type) {
        case SymType.VARIABLE: return 'variable';
        case SymType.FUNCTION: return 'function';
        case SymType.EXPORTED_FUNCTION: return 'exported function';
        case SymType.MODULE_FUNCTION: return 'module function';
        case SymType.PROGRAM: return 'program';
        case SymType.CONSTANT: return 'constant';
        case SymType.ENUM_CONSTANT: return 'enum constant';
        case SymType.NAMESPACE: return 'module';
        case SymType.FUNCTION_ARGUMENT: return 'function argument';
        case SymType.PROGRAM_ARGUMENT: return 'program argument';
        case SymType.LABEL: return 'source label';
        case SymType.TYPEDEF: return 'type';
        }
    }

    public isCallable() {
        return this.type === SymType.FUNCTION || this.type === SymType.MODULE_FUNCTION || this.type === SymType.EXPORTED_FUNCTION;
    }


    static getParams(tags: doctrine.Tag[]) {
        return tags.reduce((p,c) => c.title === 'param' && c.name ? ({...p, [c.name.id]: c}) : p, {} as {[x: string]: doctrine.Tag});
    }

    public toSymbolKind(): SymbolKind {
        switch (this.type) {
        case SymType.FUNCTION:
        case SymType.EXPORTED_FUNCTION:
        case SymType.MODULE_FUNCTION:
        case SymType.PROGRAM:
            return SymbolKind.Function;
        case SymType.VARIABLE:
        case SymType.CONSTANT:
        case SymType.ENUM_CONSTANT:
        case SymType.FUNCTION_ARGUMENT:
        case SymType.PROGRAM_ARGUMENT:
            return SymbolKind.Variable;
        case SymType.NAMESPACE:
            return SymbolKind.Namespace;
        case SymType.LABEL:
            return SymbolKind.File;
        case SymType.TYPEDEF:
            return SymbolKind.TypeParameter;
        }
    }

    public toLocation(): Location {
        return this.location;
    }

    public toSymbolInformation(): SymbolInformation {
        // All our symbols are single-lined. The only multi-lined tokens are strings and comments
        return SymbolInformation.create(this.name, this.toSymbolKind(),
            this.location.range,
            this.location.uri
        );
    }

    private static toTypeString(tag?: doctrine.Type): string {
        switch (tag?.type) {
        case 'NameExpression': return tag.name;
        case 'AllLiteral': return '*';
        case 'StringLiteralType': return `"${tag.value}"`;
        case 'NumericLiteralType': return `0x${(tag.value).toString(16)}`;
        case 'ArrayType': return `[${tag.elements.map(x => this.toTypeString(x)).join(', ')}]`;
        case 'FunctionType': return `(${tag.params.map(x => this.toTypeString(x)).join(', ')}): ${this.toTypeString(tag.result as any as doctrine.Type)}`;
        case 'ParameterType': return `${tag.name}: ${this.toTypeString(tag.expression)}`;
        case 'TypeApplication': return `${this.toTypeString(tag.expression)}<${tag.applications.map(app => this.toTypeString(app)).join(', ')}>`;
        case 'UninitObjectLiteral': return '<uninit>';
        }
        return '';
    }
    public static toTypePostfix(tag?: doctrine.Type | null): string {
        if (tag && tag.type !== 'AllLiteral') {
            return ': ' + Sym.toTypeString(tag);
        }
        return '';
    }

    public static typeToMarkup(prop: MethodProperty | MemberProperty | ExportedProperty): MarkupContent | null {
        let value: string = '';

        if (prop.type === 'member') {
            if (prop.tag.name) {
                const annoType = prop.tag.type ?? { type: 'AllLiteral' };

                if (annoType.type === 'FunctionType') {
                    value += `\`\`\`(method) ${prop.impl}.${prop.tag.name.id}${this.toTypeString(annoType)}\`\`\``;
                } else if (annoType.type === 'NameExpression' || annoType.type === 'AllLiteral') {
                    value = `\`\`\`(${prop.tag.modifier && 'readonly' in prop.tag.modifier ? 'readonly ' : ''}property) ${prop.impl}.${prop.tag.name.id}${this.toTypePostfix(annoType)}\`\`\``;
                }
                if (prop.tag.description) {
                    value += `\n\n${prop.tag.description}`;
                }
            }
        } else if (prop.type === 'method' && prop.tag.name) {
            let returns: string = '';
            value += `\`\`\`(method) ${prop.tag.name.id}(`;
            value += prop.anno.tags.reduce((p, tag) => {
                if (tag.title === 'param' && tag.name) {
                    return p + (p ? ', ' : '') + tag.name.id + this.toTypePostfix(tag.type);
                } else if (tag.title === 'returns') {
                    returns = this.toTypePostfix(tag.type);
                }
                return p;
            }, '');
            value += `)${returns}\`\`\``;

            const description = prop.anno.description ?? prop.tag.description;
            if (description) {
                value += `\n\n${description}`;
            }
        } else if (prop.type === 'exported') {
            value += `\`\`\`(exported method) ${prop.impl}.${prop.name}(`;
            prop.sym.args?.forEach(({symbol}, i) => {
                if (i === 0) {
                    return;
                }
                value += (i > 1 ? ', ' : '') + symbol.getCasedName();
            });
            value += `)${Sym.toTypePostfix(prop.sym.getAnnoReturns())}\`\`\``;

            const description = prop.sym.getAnnotation()?.description;
            if (description) {
                value += `\n\n${description}`;
            }
        }
        if (value) {
            return {
                kind: 'markdown',
                value
            };
        }
        return null;
    }

    public getParamTag(name: string, scopes?: Scope[]): doctrine.Tag | undefined {
        if (!scopes || !scopes.length) {
            return this.paramToTag?.[name];
        }
        const objectName = this.annoType?.type === 'NameExpression' ? this.annoType.name : '*';

        const typeProp = Scope.findTypeProperty(scopes, objectName, name);
        if (typeProp?.type === 'member') {
            return typeProp.tag;
        }

        return undefined;
    }

    public findMethod(name: string): { name: string, tag: doctrine.Tag, anno: doctrine.Annotation } | null {
        const methods = this.findMethods(name, true);
        if (methods) {
            return methods[0];
        }
        return null;
    }

    public findMethods(prefix: string, exact = false): MethodDefinition[] {
        prefix = prefix.toLowerCase();
        let tag: doctrine.Tag | undefined;
        return this.methods ? Object.entries(this.methods).reduce((p, [name, def]) => exact && name === prefix || name.toLowerCase().startsWith(prefix) ? p.concat(def) : p, [] as MethodDefinition[]) : [];
    }


    public findParamTags(prefix: string): doctrine.Tag[] {
        prefix = prefix.toLowerCase();
        return this.paramToTag ? Object.entries(this.paramToTag).reduce((p, [name, tag]) => p.concat(name.toLowerCase().startsWith(prefix) ? [tag] : []), [] as doctrine.Tag[]) : [];
    }

    private paramToTypePostfix(name: string): string {
        const type = this.paramToTag?.[name]?.type;
        if (type && type.type !== 'AllLiteral') {
            return ': ' + Sym.toTypeString(type);
        }
        return '';
    }

    public toMarkup(): MarkupContent {
        let value = `\`\`\`\n(${this.getTypeName()}) ${this.getCasedName()}`;
        let paramType;
        if (this.children && (this.type === SymType.MODULE_FUNCTION || this.type === SymType.FUNCTION)) { // && this.childScope) {
            value += '(';
            value += Array.from(this.children).map((child) => `${child.symbol.getCasedName()}${child.required ? '' : '?'}${this.paramToTypePostfix(child.symbol.getName())}`).join(', ');
            value += ')';
        }
        value += Sym.toTypePostfix(this.annoType ?? this.annoReturns);
        value += '\n```';
        if (this.annotation) {
            // this.annotation.tags[0].modifier
            value += `\n\n${this.annotation.description.replace(/(\r|\n|\r\n)/g, '  \n')}`;
        }
        return {
            kind: 'markdown',
            value
        };
    }

    static getCompletionItems(properties?: TypeProperties | null) {
        const results: CompletionItem[] = [];

        if (properties) {
            for (const { impl, tag, name } of properties.members) {
                const item: CompletionItem = {
                    label: name,
                    kind: CompletionItemKind.Property,
                    detail: `${impl}.${name}`,
                    documentation: tag.description ?? undefined
                };
                results.push(item);
            }
            for (const typeProp of properties.methods) {
                // const typeProp = properties.methods[title];
                if (typeProp.type === 'method') {
                    const item: CompletionItem = {
                        label: typeProp.name,
                        kind: CompletionItemKind.Method,
                        detail: `${typeProp.impl}.${typeProp.name}`,
                        documentation: typeProp.tag.description ?? undefined
                    };
                    results.push(item);
                } else {
                    const item: CompletionItem = {
                        label: typeProp.sym.getCasedName(),
                        kind: CompletionItemKind.Method,
                        detail: typeProp.impl,
                        documentation: typeProp.sym.getAnnotation()?.description ?? undefined
                    };
                    results.push(item);
                }
            }
        }
        return results;
    }

    getCompletionItems(scopes: Scope[], prefix: string): CompletionItem[] {
        const objectName = this.annoType?.type === 'NameExpression' ? this.annoType.name : '*';
        const properties = Scope.findTypeProperties(scopes, objectName, prefix);
        return Sym.getCompletionItems(properties);
    }

    getMemberMarkup(propName: string, scopes: Scope[], where: 'methods' | 'members'): Hover | null {
        const objectName = this.annoType?.type === 'NameExpression' ? this.annoType.name : '*';
        const property = Scope.findTypeProperty(scopes, objectName, propName);
        if (property) {
            console.log('found property', property);
            const contents = Sym.typeToMarkup(property);
            console.log('contents', contents);
            if (contents) {
                return { contents };
            }
        }
        return null;
    }

    public toDocumentSymbol(selectionRange: Range): DocumentSymbol {
        return DocumentSymbol.create(this.name, undefined, this.toSymbolKind(),
            this.location.range,
            { ...selectionRange });
    }

    public toDefinitionLink(property?: MemberProperty | MethodProperty): DefinitionLink | undefined {
        if (property && property.tag.lineNumber !== undefined && property.tag.character !== undefined) {
            // const parent = property.type === 'member' ? this.toLocation().range : property.location.range;
            // let range: Range | undefined;
            if (property.type === 'member') {
                const parent = this.toLocation().range;
                const range: Range = {
                    start: {
                        line: parent.start.line + property.tag.lineNumber - 1,
                        character: property.tag.character - 1
                    },
                    end: {
                        line: parent.start.line + property.tag.lineNumber - 1,
                        character: property.tag.character - 1 + property.name.length
                    },
                };
                return {
                    targetRange: range,
                    targetUri: this.location.uri,
                    targetSelectionRange: { ...range }
                };

            } else if (property.tag.name) {
                const { characterPosition, lineNumber } = property.tag.name;
                const range: Range = {
                    start: {
                        line: property.location.range.start.line + lineNumber - 1,
                        character: characterPosition - 1
                    },
                    end: {
                        line: property.location.range.start.line + lineNumber - 1,
                        character: characterPosition + property.tag.name.id.length - 1
                    },
                };
                return {
                    targetRange: range,
                    targetUri: property.location.uri,
                    targetSelectionRange: { ...range }
                };
            }
        } else {
            return {
                targetRange: this.location.range,
                targetUri: this.location.uri,
                targetSelectionRange: { ...this.location.range }
            };
        }
    }

    getAnnotatedString(): string {
        const args: string[] = [];
        // if (this.childScope) {
        //     for (const [name, sym] of this.childScope.symbols) {
        //         let type: doctrine.Type | undefined | null = undefined;
        //         if ((type = this.paramToTag?.[name]?.type) && type.type === 'NameExpression') {
        //             args.push(`${name}: ${type.name}`);
        //         } else {
        //             args.push(`${name}`);
        //         }
        //     }
        // }
        // return `${this.casedName}${this.childScope ? `(${args.join(', ')})` : ''}`;
        return '';
    }

    toCompletionItem(): CompletionItem {
        return {
            label: this.getCasedName(),
            kind: this.toCompletionKind(),
            detail: this.getAnnotatedString(),
            documentation: 'This is the documentation'
        };
    }

    toCompletionKind(): CompletionItemKind {
        switch (this.type) {
        case SymType.FUNCTION:
        case SymType.EXPORTED_FUNCTION:
        case SymType.MODULE_FUNCTION:
        case SymType.PROGRAM:
            return CompletionItemKind.Function;
        case SymType.VARIABLE:
        case SymType.CONSTANT:
        case SymType.ENUM_CONSTANT:
        case SymType.FUNCTION_ARGUMENT:
        case SymType.PROGRAM_ARGUMENT:
            return CompletionItemKind.Variable;
        case SymType.NAMESPACE:
            return CompletionItemKind.Module;
        case SymType.LABEL:
            return CompletionItemKind.Text;
        case SymType.TYPEDEF:
            return CompletionItemKind.TypeParameter;
        }
    }

    static toSignatureHelp(tag: doctrine.Tag, currentArg = 0): SignatureHelp | null {
        // if (tag.)
        console.log('get signature help for', tag);
        if (tag.title === 'method' && tag.type && tag.type.type === 'FunctionType' && tag.name) {
            const funcName = tag.name.id;
            const parameters: ParameterInformation[] = [];
            let signatureLabel = `${funcName}(`;
            // Array.from(this.childScope?.symbols || []).forEach(([name, sym], index, arr) => {
            tag.type.params.forEach((child, index, arr) => {
                // this.children?.forEach((child, index, arr) => {
                if (child.type === 'ParameterType') {
                    // const { symbol, required } = child;
                    const name = child.name;

                    const label = `${name}${Sym.toTypePostfix(child.expression)}`;
                    parameters.push(
                        ParameterInformation.create([signatureLabel.length, signatureLabel.length + label.length], undefined)
                    );
                    signatureLabel += label + (index === arr.length - 1 ? '' : ', ');
                }
            });

            signatureLabel += ')';

            const result: SignatureHelp = {
                signatures: [SignatureInformation.create(signatureLabel, tag.description ?? undefined, ...parameters)],
                activeParameter: currentArg,
                activeSignature: 0
            };
            console.error('sig help is', result);
            return result;
        }
        return null;
    }

    toMethodSignatureHelp(scopes: Scope[], methodName: string, currentArg = 0): SignatureHelp | null {
        const objectName = this.annoType?.type === 'NameExpression' ? this.annoType.name : '*';
        const method = Scope.findTypeProperty(scopes, objectName, methodName);

        // const method = this.findMethod(methodName);
        if (method && method.type === 'method' && method.tag.name) {
            // const funcName = this.getCasedName();
            const parameters: ParameterInformation[] = [];
            let signatureLabel = `${method.tag.name.id}(`;
            // Array.from(this.childScope?.symbols || []).forEach(([name, sym], index, arr) => {
            // method.anno.tags
            let returns: string = '';
            let putParam = false;
            method.anno.tags.forEach(tag => {
                if (tag.title === 'param' && tag.name) {
                    const label = `${tag.name.id}${Sym.toTypePostfix(tag.type)}${tag.modifier && 'optional' in tag.modifier ? '?' : ''}`;
                    parameters.push(
                        ParameterInformation.create([signatureLabel.length + (putParam ? 2 : 0), signatureLabel.length + label.length + (putParam ? 2 : 0)], tag.description ?? undefined)
                    );
                    signatureLabel += (putParam ? ', ' : '') + label;
                    putParam = true;
                } else if (tag.title === 'returns') {
                    returns = Sym.toTypePostfix(tag.type);
                }
            });
            signatureLabel += ')';
            signatureLabel += returns;

            const result: SignatureHelp = {
                signatures: [SignatureInformation.create(signatureLabel, method.tag.description ?? method.anno.description, ...parameters)],
                activeParameter: currentArg,
                activeSignature: 0
            };
            console.error('sig help is', result);
            return result;
        }
        return null;
    }

    toSignatureHelp(currentArg = 0): SignatureHelp | null {
        const funcName = this.getCasedName();
        const parameters: ParameterInformation[] = [];
        let signatureLabel = `${funcName}(`;
        // Array.from(this.childScope?.symbols || []).forEach(([name, sym], index, arr) => {
        this.children?.forEach((child, index, arr) => {
            const { symbol, required } = child;
            const name = symbol.getCasedName();
            const label = `${name}${this.paramToTag ? Sym.toTypePostfix(this.paramToTag[name].type) : ''}${required ? '' : '?'}`;
            parameters.push(
                ParameterInformation.create([signatureLabel.length, signatureLabel.length + label.length], this.paramToTag?.[name]?.description ?? undefined)
            );
            signatureLabel += label + (index === arr.length - 1 ? '' : ', ');
        });

        signatureLabel += ')';

        const result: SignatureHelp = {
            signatures: [SignatureInformation.create(signatureLabel, this.annotation?.description, ...parameters)],
            activeParameter: currentArg,
            activeSignature: 0
        };
        console.error('sig help is', result);
        return result;
    }

    public getFile() {
        return fileURLToPath(this.location.uri);
    }

    public getLocation() {
        return `${this.getFile()}:${this.location.range.start.line}:${this.location.range.start.character}`;
    }
}




const findScope = (scope: Scope, f: string, pos: Position): Scope => {
    for (const child of scope.children) {
        if (child.location.uri === f && containsPosition(child.location.range, pos)) { return findScope(child, f, pos); }
    }
    return scope;
};
