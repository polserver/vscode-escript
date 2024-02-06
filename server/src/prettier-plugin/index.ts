import { AstPath, Doc, Parser, Printer, Options, doc } from 'prettier';

const { group, join, indent, dedent, line, softline, hardline } = doc.builders;

interface ASTNodeInterface {
    'end': {
        'character_column': number,
        'line_number': number,
        'token_index': number
        'index': number
    },
    'start': {
        'character_column': number,
        'line_number': number,
        'token_index': number
        'index': number
    }
}

interface ASTExpressionNode extends ASTNodeInterface {
    parenthesized: true | undefined
}

interface ASTFileNode extends ASTNodeInterface {
    type: 'file'
    body: ASTNode[]
    module: boolean
}

interface ASTVarStatementNode extends ASTNodeInterface {
    type: 'var-statement'
    declarations: ASTNode[]
}

interface ASTConstStatementNode extends ASTNodeInterface {
    type: 'const-statement'
    name: ASTIdentifierNode
    init: null | ASTNode
    assign: boolean
}

interface ASTIdentifierNode extends ASTExpressionNode {
    type: 'identifier'
    id: string
}

interface ASTWhiteStatementNode extends ASTNodeInterface {
    type: 'while-statement'
    label: null | ASTIdentifierNode
    test: ASTNode
    body: ASTNode[]
}

interface ASTArrayExpressionNode extends ASTExpressionNode {
    type: 'array-expression'
    explicit: boolean
    short: boolean
    elements: ASTNode[]
}
interface ASTExpressionStatementNode extends ASTNodeInterface {
    type: 'expression-statement'
    expression: ASTNode
}

interface ASTVarDeclarationNode extends ASTNodeInterface {
    type: 'var-declaration'
    name: ASTIdentifierNode;
    init: null | ASTNode
    assign: boolean
}

interface ASTDictionaryInitializerNode extends ASTNodeInterface {
    type: 'dictionary-initializer'
    key: ASTNode
    init: null | ASTNode
}

interface ASTDoStatementNode extends ASTNodeInterface {
    type: 'do-statement'
    label: null | ASTIdentifierNode
    test: ASTNode
    body: ASTNode[]
}

interface ASTEnumEntryNode extends ASTNodeInterface {
    type: 'enum-entry'
    name: ASTIdentifierNode
    init: null | ASTNode
}

interface ASTEnumStatementNode extends ASTNodeInterface {
    type: 'enum-statement'
    identifier: ASTIdentifierNode
    enums: ASTEnumEntryNode[]
}

interface ASTExitStatementNode extends ASTNodeInterface {
    type: 'exit-statement'
}

interface ASTDictionaryExpressionNode extends ASTExpressionNode {
    type: 'dictionary-expression'
    short: boolean;
    entries: ASTDictionaryInitializerNode[]
}

interface ASTErrorExpressionNode extends ASTExpressionNode {
    type: 'error-expression'
    members: ASTStructInitializerNode[]
    short: boolean
}

interface ASTStructExpressionNode extends ASTExpressionNode {
    type: 'struct-expression'
    members: ASTStructInitializerNode[]
    short: boolean
}

interface ASTStructInitializerNode extends ASTNodeInterface {
    type: 'struct-initializer'
    name: ASTIdentifierNode
    init: null | ASTNode
}

interface ASTUnaryExpressionNode extends ASTExpressionNode {
    type: 'unary-expression'
    prefix: boolean
    operator: string
    argument: ASTNode
}

interface ASTBinaryExpressionNode extends ASTExpressionNode {
    type: 'binary-expression'
    left: ASTNode
    operator: string
    right: ASTNode
}

interface ASTConditionalExpressionNode extends ASTExpressionNode {
    type: 'conditional-expression'
    conditional: ASTNode
    consequent: ASTNode
    alternate: ASTNode
}

interface ASTElementAccessExpressionNode extends ASTExpressionNode {
    type: 'element-access-expression'
    indexes: ASTNode[]
    entity: ASTNode
}

interface ASTMemberAccessExpressionNode extends ASTExpressionNode {
    type: 'member-access-expression'
    accessor: ASTNode
    entity: ASTNode
}

interface ASTMethodCallExpressionNode extends ASTExpressionNode {
    type: 'method-call-expression'
    name: ASTIdentifierNode
    arguments: ASTNode[]
    entity: ASTNode
}

interface ASTForeachStatementNode extends ASTNodeInterface {
    type: 'foreach-statement'
    identifier: ASTIdentifierNode
    expression: ASTNode
    label: null | ASTIdentifierNode
    parenthesized: boolean;
    body: ASTNode[]
}

interface ASTFunctionCallExpressionNode extends ASTExpressionNode {
    type: 'function-call-expression'
    callee: ASTIdentifierNode
    arguments: ASTNode[]
    scope: null | ASTIdentifierNode
}

interface ASTFunctionDeclarationNode extends ASTNodeInterface {
    type: 'function-declaration'
    name: ASTIdentifierNode
    parameters: ASTFunctionParameterNode[]
    exported: boolean
    body: ASTNode[]
}

interface ASTFunctionParameterNode extends ASTNodeInterface {
    type: 'function-parameter'
    name: ASTIdentifierNode
    init: null | ASTNode
    byref: boolean
    unused: boolean
}

interface ASTBreakStatementNode extends ASTNodeInterface {
    type: 'break-statement'
    label: null | ASTIdentifierNode
}

interface ASTSwitchBlockNode extends ASTNodeInterface {
    type: 'switch-block'
    labels: ASTNode[]
    body: ASTNode[]
}

interface ASTDefaultCaseLabelNode extends ASTNodeInterface {
    type: 'default-case-label'
}

interface ASTCaseStatementNode extends ASTNodeInterface {
    type: 'case-statement'
    label: null | ASTIdentifierNode
    test: ASTNode
    cases: ASTNode[]
}

interface ASTContinueStatementNode extends ASTNodeInterface {
    type: 'continue-statement'
    label: null | ASTIdentifierNode
}

interface ASTBasicForStatementNode extends ASTNodeInterface {
    type: 'basic-for-statement'
    identifier: ASTIdentifierNode
    first: ASTNode
    last: ASTNode
    body: ASTNode[]
    label: null | ASTIdentifierNode
}

interface ASTCstyleForStatementNode extends ASTNodeInterface {
    type: 'cstyle-for-statement'
    initializer: ASTNode
    test: ASTNode
    advancer: ASTNode
    body: ASTNode[]
    label: null | ASTIdentifierNode
}

interface ASTRepeatStatementNode extends ASTNodeInterface {
    type: 'repeat-statement'
    test: ASTNode
    body: ASTNode[]
    parenthesized: boolean
    label: null | ASTIdentifierNode
}

interface ASTReturnStatementNode extends ASTNodeInterface {
    type: 'return-statement'
    expression: null | ASTNode
}

interface ASTFunctionReferenceExpressionNode extends ASTExpressionNode {
    type: 'function-reference-expression'
    name: ASTIdentifierNode
}

interface ASTGotoStatementNode extends ASTNodeInterface {
    type: 'goto-statement'
    label: ASTIdentifierNode
}

interface ASTIfStatementNode extends ASTNodeInterface {
    type: 'if-statement'
    test: ASTNode
    consequent: ASTNode[]
    alternative: null | ASTNode | ASTNode[]
    elseif: boolean
}
interface ASTEmptyStatementNode extends ASTNodeInterface {
    type: 'empty-statement'
}

interface ASTIncludeDeclarationNode extends ASTNodeInterface {
    type: 'include-declaration'
    specifier: ASTNode
}

interface ASTUseDeclarationNode extends ASTNodeInterface {
    type: 'use-declaration'
    specifier: ASTNode
}

interface ASTInterpolatedStringExpressionNode extends ASTExpressionNode {
    type: 'interpolated-string-expression'
    parts: ASTInterpolatedStringPartNode[]
}

interface ASTInterpolatedStringPartNode extends ASTNodeInterface {
    type: 'interpolated-string-part'
    expression: ASTNode
    format: null | string
    literal: boolean
}

interface ASTModuleFunctionDeclarationNode extends ASTNodeInterface {
    type: 'module-function-declaration'
    name: ASTIdentifierNode
    parameters: ASTModuleFunctionParameterNode[]
}

interface ASTModuleFunctionParameterNode extends ASTNodeInterface {
    type: 'module-function-parameter'
    name: ASTIdentifierNode
    init: null | ASTNode
}

interface ASTProgramNode extends ASTNodeInterface {
    type: 'program-declaration'
    name: ASTIdentifierNode
    parameters: ASTProgramParameterNode[]
    body: ASTNode[]
}

interface ASTProgramParameterNode extends ASTNodeInterface {
    type: 'program-parameter'
    name: ASTIdentifierNode
    unused: boolean
    init: null | ASTNode
}

interface ASTStringLiteralNode extends ASTExpressionNode {
    type: 'string-literal'
    value: string
    raw: string
}

interface ASTUninitLiteralNode extends ASTExpressionNode {
    type: 'uninit-literal'
}

interface ASTIntegerLiteralNode extends ASTExpressionNode {
    type: 'integer-literal'
    value: number
    raw: string
}

interface ASTFloatLiteralNode extends ASTExpressionNode {
    type: 'float-literal'
    value: number
    raw: string
}

interface ASTBooleanLiteralNode extends ASTExpressionNode {
    type: 'boolean-literal'
    value: boolean
    raw: string
}

interface ASTCommentNode extends ASTNodeInterface {
    type: 'comment'
    value: string
    text: string
}

interface ASTLineCommentNode extends ASTNodeInterface {
    type: 'line-comment'
    value: string
    text: string
}

type ASTNode = null | ASTArrayExpressionNode | ASTBasicForStatementNode | ASTBinaryExpressionNode | ASTBooleanLiteralNode | ASTBreakStatementNode | ASTCaseStatementNode | ASTConditionalExpressionNode | ASTConstStatementNode | ASTContinueStatementNode | ASTCstyleForStatementNode | ASTDefaultCaseLabelNode | ASTDictionaryExpressionNode | ASTDictionaryInitializerNode | ASTDoStatementNode | ASTElementAccessExpressionNode | ASTEnumEntryNode | ASTEnumStatementNode | ASTErrorExpressionNode | ASTExitStatementNode | ASTExpressionStatementNode | ASTFileNode | ASTFloatLiteralNode | ASTForeachStatementNode | ASTFunctionCallExpressionNode | ASTFunctionDeclarationNode | ASTFunctionParameterNode | ASTFunctionReferenceExpressionNode | ASTGotoStatementNode | ASTIdentifierNode | ASTIfStatementNode | ASTIncludeDeclarationNode | ASTIntegerLiteralNode | ASTInterpolatedStringExpressionNode | ASTInterpolatedStringPartNode | ASTMemberAccessExpressionNode | ASTMethodCallExpressionNode | ASTModuleFunctionDeclarationNode | ASTModuleFunctionParameterNode | ASTProgramNode | ASTProgramParameterNode | ASTRepeatStatementNode | ASTReturnStatementNode | ASTUninitLiteralNode | ASTStringLiteralNode | ASTStructExpressionNode | ASTStructInitializerNode | ASTSwitchBlockNode | ASTUnaryExpressionNode | ASTUseDeclarationNode | ASTVarDeclarationNode | ASTVarStatementNode | ASTWhiteStatementNode | ASTEmptyStatementNode | ASTCommentNode | ASTLineCommentNode

export const languages = [
    {
        name: 'escript',
        parsers: ['escript'],
        extensions: ['.src', '.inc']
    },
];

export const parsers: { [name: string]: Parser } = {
    escript: {
        astFormat: 'escript',
        parse: () => {
            throw new Error('escript.parse unimplemented');
        },
        locStart: (node: ASTNode) => {
            return node ? node.start.index : NaN;
        },
        locEnd: (node: ASTNode) => {
            return node ? node.end.index : NaN;
        }
    },
};

export const printers: { [name: string]: Printer<ASTNode> } = {
    escript: {
        // handleComments: {
        //     ownLine(commentNode, text, options, ast, isLastComment) {
        //         debugger;
        //         return false;
        //     },
        //     endOfLine(commentNode, text, options, ast, isLastComment) {
        //         debugger;
        //         return false;
        //     },
        //     remaining(commentNode, text, options, ast, isLastComment) {
        //         debugger;
        //         return false;
        //     },
        // },
        canAttachComment(node) {
            return Boolean(node && node.type && node.type !== 'comment' && node.type !== 'line-comment');
        },
        isBlockComment(node) {
            return Boolean(node && node.type === 'comment');
        },
        printComment(commentPath, options) {
            const { node } = commentPath;
            if (!node) {
                return '';
            }
            switch (node.type) {
            case 'comment':
                return node.value;
            case 'line-comment':
                return node.value;
            default:
                throw new Error(`Unhandled node type ${node.type}`);
            }
        },
        print(
            path: AstPath<ASTNode>,
            options: Options,
            print: (path: AstPath<ASTNode>) => Doc
        ): Doc[] {
            const { node } = path;
            if (node === null) {
                return [];
            }

            switch (node.type) {
            case 'file':
                return join(hardline, path.map(print, 'body'));

            case 'expression-statement':
                return [group([path.call(print, 'expression'), ';'])];

            case 'integer-literal':
                return [node.parenthesized ? '(' : '', node.raw, node.parenthesized ? ')' : ''];

            case 'boolean-literal':
                return [node.parenthesized ? '(' : '', node.raw, node.parenthesized ? ')' : ''];

            case 'string-literal':
                return [node.parenthesized ? '(' : '', node.raw, node.parenthesized ? ')' : ''];

            case 'uninit-literal':
                return [node.parenthesized ? '(' : '', 'uninit', node.parenthesized ? ')' : ''];

            case 'identifier':
                return [node.parenthesized ? '(' : '', node.id, node.parenthesized ? ')' : ''];

            case 'program-parameter':
                return [node.unused ? ['unused', ' '] : [], path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []];

            case 'include-declaration':
                return ['include', ' ', path.call(print, 'specifier'), ';'];

            case 'const-statement':
                return ['const ', path.call(print, 'name'), node.assign ? ' := ' : ' ', path.call(print, 'init'), ';'];

            case 'module-function-declaration':
                return [path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ');'];

            case 'module-function-parameter':
                return [path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []];

            case 'use-declaration':
                return ['use ', path.call(print, 'specifier'), ';'];

            case 'if-statement':
                const { alternative } = node;
                let alternativeDoc = new Array<Doc>();

                if (Array.isArray(alternative)) {
                    alternativeDoc = ['else', alternative.length ? [indent([hardline, join(hardline, path.map(print as any, 'alternative' as any))]), hardline] : hardline];
                } else if (alternative !== null) {
                    alternativeDoc = [path.call(print, 'alternative' as any)];
                }

                return [node.elseif ? 'elseif (' : 'if (', path.call(print, 'test'), ')', node.consequent.length ? [indent([hardline, join(hardline, path.map(print, 'consequent'))]), hardline] : hardline, alternativeDoc, node.elseif ? '' : ['endif']];

            case 'program-declaration':
                return ['program ', path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ')', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endprogram'];

            case 'binary-expression':
                return [group([node.parenthesized ? '(' : '', path.call(print, 'left'), ' ', node.operator, ' ', path.call(print, 'right'), node.parenthesized ? ')' : ''])];

            case 'enum-statement':
                // no length check here because `enums` always has 1+ elements
                return ['enum ', path.call(print, 'identifier'), indent([hardline, join([',', hardline], path.map(print, 'enums'))]), hardline, 'endenum'];

            case 'enum-entry':
                return [group([path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []])];

            case 'var-statement':
                return ['var ', join(', ', path.map(print, 'declarations')), ';'];

            case 'var-declaration':
                return [group([path.call(print, 'name'), node.init ? [node.assign ? ' := ' : ' ', path.call(print, 'init')] : []])];

            case 'function-call-expression':
                return [node.parenthesized ? '(' : '', node.scope ? [path.call(print, 'scope'), '::'] : [], path.call(print, 'callee'), '(', join(', ', path.map(print, 'arguments')), ')', node.parenthesized ? ')' : ''];

            case 'method-call-expression':
                return [path.call(print, 'entity'), '.', path.call(print, 'name'), '(', join(', ', path.map(print, 'arguments')), ')'];

            case 'element-access-expression':
                return [node.parenthesized ? '(' : '', path.call(print, 'entity'), '[', join(', ', path.map(print, 'indexes')), ']', node.parenthesized ? ')' : ''];

            case 'return-statement':
                return ['return', node.expression ? [' ', path.call(print, 'expression')] : [], ';'];

            case 'unary-expression':
                if (node.prefix) {
                    return [node.parenthesized ? '(' : '', node.operator, node.operator.toLowerCase() === 'not' ? ' ' : '', path.call(print, 'argument'), node.parenthesized ? ')' : ''];
                } else {
                    return [node.parenthesized ? '(' : '', path.call(print, 'argument'), node.operator, node.operator.toLowerCase() === 'not' ? ' ' : '', node.parenthesized ? ')' : ''];
                }

            case 'member-access-expression':
                return [node.parenthesized ? '(' : '', path.call(print, 'entity'), '.', path.call(print, 'accessor'), node.parenthesized ? ')' : ''];

            case 'function-declaration':
                node.exported;
                node.name;
                node.parameters;
                node.body;
                return [node.exported ? 'exported ' : '', 'function ', path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ')', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endfunction'];

            case 'function-parameter':
                node.byref;
                node.unused;
                node.name;
                node.init;
                return [node.byref ? 'byref ' : '', node.unused ? 'unused ' : '', path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []];

            case 'array-expression':
                if (node.short) {
                    return [node.parenthesized ? '(' : '', 'array', node.parenthesized ? ')' : ''];
                } else {
                    return [node.parenthesized ? '(' : '', node.explicit ? 'array' : '', '{', join(', ', path.map(print, 'elements')), '}', node.parenthesized ? ')' : ''];
                }

            case 'dictionary-expression':
                if (node.short) {
                    return [node.parenthesized ? '(' : '', 'dictionary', node.parenthesized ? ')' : ''];
                } else {
                    return [node.parenthesized ? '(' : '', 'dictionary{', join(', ', path.map(print, 'entries')), '}', node.parenthesized ? ')' : ''];
                }

            case 'dictionary-initializer':
                return [path.call(print, 'key'), node.init ? [' -> ', path.call(print, 'init')] : []];

            case 'while-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'while (', path.call(print, 'test'), ')', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endwhile'];

            case 'case-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'case (', path.call(print, 'test'), ')', node.cases.length ? [indent([hardline, join(hardline, path.map(print, 'cases'))]), hardline] : hardline, 'endcase'];

            case 'switch-block':
                const labels: Doc[] = node.labels.map((_, index) => [(path as any).call(print, 'labels', index), ':']);
                return [join(hardline, labels), node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))])] : ''];

            case 'default-case-label':
                return ['default'];

            case 'foreach-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'foreach ', path.call(print, 'identifier'), ' in ', node.parenthesized ? '(' : '', path.call(print, 'expression'), node.parenthesized ? ')' : '', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endforeach'];

            case 'cstyle-for-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'for (', path.call(print, 'initializer'), '; ', path.call(print, 'test'), '; ', path.call(print, 'advancer'), ')', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endfor'];

            case 'break-statement':
                return ['break', node.label ? [' ', path.call(print, 'label')] : [], ';'];

            case 'continue-statement':
                return ['continue', node.label ? [' ', path.call(print, 'label')] : [], ';'];

            case 'basic-for-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'for ', path.call(print, 'identifier'), ' := ', path.call(print, 'first'), ' to ', path.call(print, 'last'), node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'endfor'];

            case 'conditional-expression':
                return [node.parenthesized ? '(' : '', path.call(print, 'conditional'), ' ? ', (path as any).call(print, 'consequent'), ' : ', path.call(print, 'alternate'), node.parenthesized ? ')' : ''];

            case 'do-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'do', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'dowhile (', path.call(print, 'test'), ');'];

            case 'error-expression':
                if (node.short) {
                    return [node.parenthesized ? '(' : '', 'error', node.parenthesized ? ')' : ''];
                } else {
                    return [node.parenthesized ? '(' : '', 'error{', join(', ', path.map(print, 'members')), '}', node.parenthesized ? ')' : ''];
                }

            case 'struct-expression':
                if (node.short) {
                    return [node.parenthesized ? '(' : '', 'struct', node.parenthesized ? ')' : ''];
                } else {
                    return [node.parenthesized ? '(' : '', 'struct{', join(', ', path.map(print, 'members')), '}', node.parenthesized ? ')' : ''];
                }

            case 'struct-initializer':
                return [path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []];

            case 'exit-statement':
                return ['exit;'];

            case 'float-literal':
                return [node.raw];

            case 'function-reference-expression':
                return [node.parenthesized ? '(' : '', '@', path.call(print, 'name'), node.parenthesized ? ')' : ''];

            case 'goto-statement':
                return ['goto ', path.call(print, 'label'), ';'];

            case 'interpolated-string-expression':
                return [node.parenthesized ? '(' : '', '$"', path.map(print, 'parts'), '"', node.parenthesized ? ')' : ''];

            case 'interpolated-string-part':
                const addBraces = !node.literal;
                return [addBraces ? '{' : '', path.call(print, 'expression'), node.format ? [':', node.format] : [], addBraces ? '}' : ''];

            case 'repeat-statement':
                return [node.label ? [path.call(print, 'label'), ':', hardline] : [], 'repeat', node.body.length ? [indent([hardline, join(hardline, path.map(print, 'body'))]), hardline] : hardline, 'until ', node.parenthesized ? '(' : '', path.call(print, 'test'), node.parenthesized ? ')' : '', ';'];

            case 'empty-statement':
                return [';'];

            default:
                throw new Error(`Unhandled node type ${node.type} at ${node.start.line_number}:${node.start.character_column}`);
            }
        },
    },
};