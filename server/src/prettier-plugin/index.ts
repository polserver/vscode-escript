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
}

interface ASTIdentifierNode extends ASTNodeInterface {
    type: 'identifier'
    id: string
}

interface ASTWhiteStatementNode extends ASTNodeInterface {
    type: 'while-statement'
    label: null | ASTIdentifierNode
    declarations: ASTNode[]
}

interface ASTArrayExpressionNode extends ASTNodeInterface {
    type: 'array-expression'
    elements: ASTNode[]
}
interface ASTExpressionStatementNode extends ASTNodeInterface {
    type: 'expression-statement'
    expression: ASTNode
}

interface ASTVariableDeclarationNode extends ASTNodeInterface {
    type: 'variable-declaration'
    name: ASTIdentifierNode;
    init: null | ASTNode
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
    identifier: ASTIdentifierNode
    value: null | ASTNode
}

interface ASTEnumStatementNode extends ASTNodeInterface {
    type: 'enum-statement'
    identifier: ASTIdentifierNode
    enums: ASTEnumEntryNode[]
}

interface ASTExitStatementNode extends ASTNodeInterface {
    type: 'exit-statement'
}

interface ASTDictionaryExpressionNode extends ASTNodeInterface {
    type: 'dictionary-expression'
    entries: ASTDictionaryInitializerNode[]
}

interface ASTErrorExpressionNode extends ASTNodeInterface {
    type: 'error-expression'
    members: ASTStructInitializerNode[]
}

interface ASTStructExpressionNode extends ASTNodeInterface {
    type: 'struct-expression'
    members: ASTStructInitializerNode[]
}

interface ASTStructInitializerNode extends ASTNodeInterface {
    type: 'struct-initializer'
    name: ASTIdentifierNode
    init: null | ASTNode
}

interface ASTUnaryExpressionNode extends ASTNodeInterface {
    type: 'unary-expression'
    prefix: boolean
    operator: string
    argument: ASTNode
}

interface ASTBinaryExpressionNode extends ASTNodeInterface {
    type: 'binary-expression'
    left: ASTNode
    operator: string
    right: ASTNode
}

interface ASTConditionalExpressionNode extends ASTNodeInterface {
    type: 'binary-expression'
    conditional: ASTNode
    consequent: ASTNode
    alternate: ASTNode
}

interface ASTElementAccessExpressionNode extends ASTNodeInterface {
    type: 'element-access-expression'
    indexes: ASTNode[]
    entity: ASTNode
}

interface ASTMemberAccessExpressionNode extends ASTNodeInterface {
    type: 'element-access-expression'
    accessor: ASTNode
    entity: ASTNode
}

interface ASTMethodCallExpressionNode extends ASTNodeInterface {
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
    body: ASTNode[]
}

interface ASTFunctionCallExpressionNode extends ASTNodeInterface {
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
    label: null | ASTIdentifierNode
}

interface ASTReturnStatementNode extends ASTNodeInterface {
    type: 'return-statement'
    value: null | ASTNode
}

interface ASTFunctionReferenceExpressionNode extends ASTNodeInterface {
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

interface ASTIncludeDeclarationNode extends ASTNodeInterface {
    type: 'include-declaration'
    specifier: ASTNode
}

interface ASTUseDeclarationNode extends ASTNodeInterface {
    type: 'use-declaration'
    specifier: ASTNode
}

interface ASTInterpolatedStringExpressionNode extends ASTNodeInterface {
    type: 'interpolated-string-expression'
    parts: ASTInterpolatedStringPartNode[]
}

interface ASTInterpolatedStringPartNode extends ASTNodeInterface {
    type: 'interpolated-string-part'
    expression: ASTNode
    format: null | ASTFormatStringNode
}

interface ASTFormatStringNode extends ASTNodeInterface {
    type: 'format-string'
    value: string
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

interface ASTStringLiteralNode extends ASTNodeInterface {
    type: 'string-literal'
    value: string
    raw: string
}

interface ASTIntegerLiteralNode extends ASTNodeInterface {
    type: 'integer-literal'
    value: number
    raw: string
}

interface ASTFloatLiteralNode extends ASTNodeInterface {
    type: 'float-literal'
    value: number
    raw: string
}

interface ASTBooleanLiteralNode extends ASTNodeInterface {
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

type ASTNode = null | ASTArrayExpressionNode | ASTBasicForStatementNode | ASTBinaryExpressionNode | ASTBooleanLiteralNode | ASTBreakStatementNode | ASTCaseStatementNode | ASTConditionalExpressionNode | ASTConstStatementNode | ASTContinueStatementNode | ASTCstyleForStatementNode | ASTDefaultCaseLabelNode | ASTDictionaryExpressionNode | ASTDictionaryInitializerNode | ASTDoStatementNode | ASTElementAccessExpressionNode | ASTEnumEntryNode | ASTEnumStatementNode | ASTErrorExpressionNode | ASTExitStatementNode | ASTExpressionStatementNode | ASTFileNode | ASTFloatLiteralNode | ASTForeachStatementNode | ASTFormatStringNode | ASTFunctionCallExpressionNode | ASTFunctionDeclarationNode | ASTFunctionParameterNode | ASTFunctionReferenceExpressionNode | ASTGotoStatementNode | ASTIdentifierNode | ASTIfStatementNode | ASTIncludeDeclarationNode | ASTIntegerLiteralNode | ASTInterpolatedStringExpressionNode | ASTInterpolatedStringPartNode | ASTMemberAccessExpressionNode | ASTMethodCallExpressionNode | ASTModuleFunctionDeclarationNode | ASTModuleFunctionParameterNode | ASTProgramNode | ASTProgramParameterNode | ASTRepeatStatementNode | ASTReturnStatementNode | ASTStringLiteralNode | ASTStructExpressionNode | ASTStructInitializerNode | ASTSwitchBlockNode | ASTUnaryExpressionNode | ASTUseDeclarationNode | ASTVariableDeclarationNode | ASTVarStatementNode | ASTWhiteStatementNode | ASTCommentNode | ASTLineCommentNode

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
            switch (node.type)
            {
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

            switch (node.type)
            {
            case 'file':
                return join(hardline, path.map(print, 'body'));

            case 'expression-statement':
                return [group([path.call(print, 'expression'), ';'])];

            case 'integer-literal':
                return [node.raw];

            case 'boolean-literal':
                return [node.raw];

            case 'string-literal':
                return [node.raw];

            case 'identifier':
                return [node.id];

            case 'program-parameter':
                return [node.unused ? ['unused', ' '] : [], path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init') ] : [] ];

            case 'include-declaration':
                return ['include', ' ', path.call(print, 'specifier'), ';'];

            case 'const-statement':
                return ['const ', path.call(print, 'name'), ' := ', path.call(print, 'init'), ';', hardline];

            case 'module-function-declaration':
                node.name;
                node.parameters;
                return [path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ');'];
            case 'module-function-parameter':
                node.name;
                node.init;
                return [path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : []];

            case 'use-declaration':
                return ['use ', path.call(print, 'specifier'), ';'];

            case 'if-statement':
                node.alternative;
                node.consequent;
                node.elseif;
                node.test;
                const {alternative} = node;
                let alternativeDoc = new Array<Doc>();

                if (alternative === null) {
                    alternativeDoc = [];
                } else if (Array.isArray(alternative)) {
                    alternativeDoc = ['else', indent([softline, join(softline, path.map(print as any, 'alternative' as any))])];
                } else {
                    alternativeDoc = [path.call(print, 'alternative' as any)];
                }
                return [node.elseif ? 'elseif' : 'if (', path.call(print, 'test'), ')', indent([softline, join(softline, path.map(print, 'consequent'))]), softline, alternativeDoc, node.elseif ? '' : [softline, 'endif']];

            case 'program-declaration':
                const body = join(softline, path.map(print, 'body'));

                return ['program ', path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ')', indent([softline, body]), softline, 'endprogram'];

            default:
                throw new Error(`Unhandled node type ${node.type}`);
            }
        },
    },
};