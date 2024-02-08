import { AstPath, Doc, Parser, Printer, Options, doc, util, Plugin, SupportInfoOptions, ParserOptions, RequiredOptions } from 'prettier';

const { isNextLineEmpty } = util;
const { group, join, indent, ifBreak, line, softline, hardline } = doc.builders;

function hasComment(node: ASTNode): boolean {
    return Boolean(node?.comments?.length);
}

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
    },
    comments?: Array<ASTCommentNode | ASTLineCommentNode>
}

interface ASTExpressionNodeInterface extends ASTNodeInterface {
    parenthesized: true | undefined
}

interface ASTLabelableStatementNodeInterface extends ASTNodeInterface {
    label: null | ASTIdentifierNode;
}

interface ASTFileNode extends ASTNodeInterface {
    type: 'file'
    body: ASTNode[]
    module: boolean
}

interface ASTVarStatementNode extends ASTNodeInterface {
    type: 'var-statement'
    declarations: ASTVarDeclarationNode[]
}

interface ASTConstStatementNode extends ASTNodeInterface {
    type: 'const-statement'
    name: ASTIdentifierNode
    init: null | ASTNode
    assign: boolean
}

interface ASTIdentifierNode extends ASTExpressionNodeInterface {
    type: 'identifier'
    id: string
}

interface ASTWhiteStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'while-statement'
    test: ASTNode
    body: ASTNode[]
}

interface ASTArrayExpressionNode extends ASTExpressionNodeInterface {
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

interface ASTDoStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'do-statement'
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

interface ASTDictionaryExpressionNode extends ASTExpressionNodeInterface {
    type: 'dictionary-expression'
    short: boolean;
    elements: ASTDictionaryInitializerNode[]
}

interface ASTErrorExpressionNode extends ASTExpressionNodeInterface {
    type: 'error-expression'
    elements: ASTStructInitializerNode[]
    short: boolean
}

interface ASTStructExpressionNode extends ASTExpressionNodeInterface {
    type: 'struct-expression'
    elements: ASTStructInitializerNode[]
    short: boolean
}

interface ASTStructInitializerNode extends ASTNodeInterface {
    type: 'struct-initializer'
    name: ASTIdentifierNode
    init: null | ASTNode
}

interface ASTUnaryExpressionNode extends ASTExpressionNodeInterface {
    type: 'unary-expression'
    prefix: boolean
    operator: string
    argument: ASTNode
}

interface ASTBinaryExpressionNode extends ASTExpressionNodeInterface {
    type: 'binary-expression'
    left: ASTNode
    operator: string
    right: ASTNode
}

interface ASTConditionalExpressionNode extends ASTExpressionNodeInterface {
    type: 'conditional-expression'
    conditional: ASTNode
    consequent: ASTNode
    alternate: ASTNode
}

interface ASTElementAccessExpressionNode extends ASTExpressionNodeInterface {
    type: 'element-access-expression'
    indexes: ASTNode[]
    entity: ASTNode
}

interface ASTMemberAccessExpressionNode extends ASTExpressionNodeInterface {
    type: 'member-access-expression'
    accessor: ASTNode
    entity: ASTNode
}

interface ASTMethodCallExpressionNode extends ASTExpressionNodeInterface {
    type: 'method-call-expression'
    name: ASTIdentifierNode
    arguments: ASTNode[]
    entity: ASTNode
}

interface ASTForeachStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'foreach-statement'
    identifier: ASTIdentifierNode
    expression: ASTNode
    body: ASTNode[]
}

interface ASTFunctionCallExpressionNode extends ASTExpressionNodeInterface {
    type: 'function-call-expression'
    name: ASTIdentifierNode
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

interface ASTCaseStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'case-statement'
    test: ASTNode
    body: ASTNode[]
}

interface ASTContinueStatementNode extends ASTNodeInterface {
    type: 'continue-statement'
    label: null | ASTIdentifierNode
}

interface ASTBasicForStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'basic-for-statement'
    identifier: ASTIdentifierNode
    first: ASTNode
    last: ASTNode
    body: ASTNode[]
}

interface ASTCstyleForStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'cstyle-for-statement'
    initializer: ASTNode
    test: ASTNode
    advancer: ASTNode
    body: ASTNode[]
}

interface ASTRepeatStatementNode extends ASTLabelableStatementNodeInterface {
    type: 'repeat-statement'
    test: ASTNode
    body: ASTNode[]
}

interface ASTReturnStatementNode extends ASTNodeInterface {
    type: 'return-statement'
    expression: null | ASTNode
}

interface ASTFunctionReferenceExpressionNode extends ASTExpressionNodeInterface {
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

interface ASTInterpolatedStringExpressionNode extends ASTExpressionNodeInterface {
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

interface ASTStringLiteralNode extends ASTExpressionNodeInterface {
    type: 'string-literal'
    value: string
    raw: string
}

interface ASTUninitLiteralNode extends ASTExpressionNodeInterface {
    type: 'uninit-literal'
}

interface ASTIntegerLiteralNode extends ASTExpressionNodeInterface {
    type: 'integer-literal'
    value: number
    raw: string
}

interface ASTFloatLiteralNode extends ASTExpressionNodeInterface {
    type: 'float-literal'
    value: number
    raw: string
}

interface ASTBooleanLiteralNode extends ASTExpressionNodeInterface {
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
type ASTExpressionNode = ASTIdentifierNode | ASTArrayExpressionNode | ASTDictionaryExpressionNode | ASTErrorExpressionNode | ASTStructExpressionNode | ASTUnaryExpressionNode | ASTBinaryExpressionNode | ASTConditionalExpressionNode | ASTElementAccessExpressionNode | ASTMemberAccessExpressionNode | ASTMethodCallExpressionNode | ASTFunctionCallExpressionNode | ASTFunctionReferenceExpressionNode | ASTInterpolatedStringExpressionNode | ASTStringLiteralNode | ASTUninitLiteralNode | ASTIntegerLiteralNode | ASTFloatLiteralNode | ASTBooleanLiteralNode
type ASTLabelableStatementNode = ASTWhiteStatementNode | ASTDoStatementNode | ASTForeachStatementNode | ASTCaseStatementNode | ASTBasicForStatementNode | ASTCstyleForStatementNode | ASTRepeatStatementNode
type ASTBodyContainingNode = ASTLabelableStatementNode | ASTFunctionDeclarationNode | ASTSwitchBlockNode

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

const printSequence = (path: AstPath<ASTNode>, options: Options, print: (path: AstPath<ASTNode>) => Doc, property: any, joiner: Doc = []): Doc[] => {
    return path.map(({ isLast, node }) => {
        const printed = print(undefined as any);

        const { originalText } = options;
        if (typeof originalText === 'string') {
            if (!isLast && isNextLineEmpty(originalText, parsers.escript.locEnd(node))) {
                return [printed, joiner, hardline];
            }
        }

        return [printed, isLast ? [] : joiner];
    }, property);
};

const findConstGroup = <NodeType extends ASTNode>(path: AstPath<ASTNode>, node: NodeType, additionalFilter?: (node: NodeType) => boolean): NodeType[] => {
    const { index, siblings } = path;

    if (index === null || siblings === null || node === null) {
        return [];
    }

    const nodes = new Array<NodeType>();

    let search_index = index - 1, line_number = node.start.line_number;

    while (search_index >= 0) {
        const search_node = siblings[search_index];
        if (!search_node || search_node.type !== node.type) {
            break;
        } else if (additionalFilter && !additionalFilter(search_node as NodeType)) {
            break;
        }

        if (search_node.end.line_number === line_number || search_node.end.line_number === line_number - 1) {
            nodes.push(search_node as NodeType);
            --search_index;
            line_number = search_node.start.line_number;
            continue;
        }
        break;
    }

    nodes.push(node);

    search_index = index + 1;
    line_number = node.end.line_number;

    while (search_index < siblings.length) {
        const search_node = siblings[search_index];
        if (!search_node || search_node.type !== node.type) {
            break;
        } else if (additionalFilter && !additionalFilter(search_node as NodeType)) {
            break;
        }

        if (search_node.start.line_number === line_number || search_node.start.line_number === line_number + 1) {
            nodes.push(search_node as NodeType);
            ++search_index;
            line_number = search_node.end.line_number;
            continue;
        }
        break;
    }

    return nodes;
};

const characterSpacing = (addIf: boolean, start: Doc, doc: Doc, end: Doc): Doc => {
    return [
        [start, addIf ? ' ' : ''],
        doc,
        [addIf ? ifBreak('', ' ') : '', end]
    ];
};

const emptySpacing = (addIf: boolean, start: Doc, end: Doc): Doc => {
    return [start, addIf ? ' ' : '', end];
};

const labelStatement = (node: ASTLabelableStatementNodeInterface, path: AstPath<ASTNode>, print: (path: AstPath<ASTNode>) => doc.builders.Doc, doc: Doc): Doc => {
    return [node.label ? [path.call(print, 'label'), ':', hardline] : '', doc];
};

const parenthesizeExpression = (node: ASTExpressionNode, options: EscriptPrettierPluginOptions, doc: Doc): Doc => {
    if (node.parenthesized) {
        return group(characterSpacing(options.otherParenthesisSpacing, '(', doc, ')'));
    } else {
        return group(doc);
    }
};

const functionCallLike = (node: ASTFunctionCallExpressionNode | ASTMethodCallExpressionNode, options: EscriptPrettierPluginOptions, prefix: Doc, path: AstPath<ASTNode>, print: (path: AstPath<ASTNode>) => doc.builders.Doc): Doc => {
    const args = node.arguments.length === 0 ?
        emptySpacing(options.emptyParenthesisSpacing, '(', ')') :
        characterSpacing(options.otherParenthesisSpacing,
            '(',
            [indent([softline, join([', ', softline], path.map(print, 'arguments'))]), ifBreak(line)],
            ')');

    return parenthesizeExpression(node, options, [prefix, path.call(print, 'name'), args]);
};

const functionParametersLike = (node: ASTFunctionDeclarationNode | ASTModuleFunctionDeclarationNode, options: EscriptPrettierPluginOptions, path: AstPath<ASTNode>, print: (path: AstPath<ASTNode>) => doc.builders.Doc): Doc => {
    return node.parameters.length === 0 ?
        ['(', options.emptyParenthesisSpacing ? ' ' : '', ')'] :
        characterSpacing(options.otherParenthesisSpacing,
            '(',
            group(join(', ', path.map(print, 'parameters'))),
            ')'
        );
};

const body = (node: ASTBodyContainingNode, options: EscriptPrettierPluginOptions, path: AstPath<ASTNode>, print: (path: AstPath<ASTNode>) => doc.builders.Doc, ending: Doc = hardline): Doc => {
    return node.body.length ? [indent([hardline, join(hardline, printSequence(path, options, print, 'body'))]), ending] : ' ';
};

export const printers: { [name: string]: Printer<ASTNode> } = {
    escript: {
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
            options: EscriptPrettierPluginOptions,
            print
        ): Doc {
            const { node } = path;
            if (node === null) {
                return [];
            }

            switch (node.type) {
            case 'file':
                return join(hardline, printSequence(path, options, print, 'body'));

            case 'expression-statement':
                return [group([path.call(print, 'expression'), ';'])];

            case 'integer-literal':
            case 'boolean-literal':
            case 'string-literal':
            case 'float-literal':
                return parenthesizeExpression(node, options, node.raw);

            case 'uninit-literal':
                return parenthesizeExpression(node, options, 'uninit');

            case 'identifier':
                return parenthesizeExpression(node, options, node.id);

            case 'program-parameter':
                return [node.unused ? 'unused ' : '', path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : ''];

            case 'include-declaration':
                return ['include', ' ', path.call(print, 'specifier'), ';'];

            case 'const-statement': {
                const constGroup = findConstGroup(path, node);
                const maxLength = constGroup.reduce((p, { assign, name: { id } }) => Math.max(id.length + (assign ? 0 : 0), p), 0);

                return ['const ', path.call(print, 'name'), ' '.repeat(maxLength - node.name.id.length + ((constGroup.length > 1 && !node.assign) ? 3 : 0)), node.assign ? ' := ' : ' ', path.call(print, 'init'), ';'];
            }

            case 'module-function-declaration': {
                return [path.call(print, 'name'),
                    functionParametersLike(node, options, path, print),
                    ';'];
            }

            case 'module-function-parameter':
                return group([path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : '']);

            case 'use-declaration':
                return ['use ', path.call(print, 'specifier'), ';'];

            case 'if-statement':
                const { alternative } = node;
                let alternativeDoc = new Array<Doc>();

                if (Array.isArray(alternative)) {
                    alternativeDoc = ['else', alternative.length ? [indent([hardline, join(hardline, printSequence(path, options, print, 'alternative'))]), hardline] : hardline];
                } else if (alternative !== null) {
                    alternativeDoc = [path.call(print, 'alternative' as any)];
                }

                return [node.elseif ? 'elseif ' : 'if ',
                    characterSpacing(options.conditionalParenthesisSpacing, '(', group(path.call(print, 'test')), ')'),
                    node.consequent.length ? [indent([hardline, join(hardline, printSequence(path, options, print, 'consequent'))]), hardline] : hardline, alternativeDoc,
                    node.elseif ? '' : 'endif'
                ];

            case 'program-declaration':
                return ['program ', path.call(print, 'name'), '(', join(', ', path.map(print, 'parameters')), ')', node.body.length ? [indent([hardline, join(hardline, printSequence(path, options, print, 'body'))]), hardline] : hardline, 'endprogram'];

            case 'binary-expression':
                return parenthesizeExpression(node, options, [path.call(print, 'left'), ' ', node.operator, ' ', path.call(print, 'right')]);

            case 'enum-statement':
                return ['enum ', path.call(print, 'identifier'), indent([hardline, join([hardline], printSequence(path, options, print, 'enums', ','))]), hardline, 'endenum'];

            case 'enum-entry': {
                let spaces = '';
                if (node.init) {
                    const enumGroup = findConstGroup(path, node, (search_node) => {
                        return Boolean(search_node.init);
                    });
                    const maxLength = enumGroup.reduce((p, { name: { id } }) => Math.max(id.length, p), 0);
                    spaces = ' '.repeat(maxLength - node.name.id.length);
                }
                return group([path.call(print, 'name'), node.init ? [spaces, ' := ', path.call(print, 'init')] : '']);
            }

            case 'var-statement': {
                const printed = path.map(print, 'declarations');

                const hasValue = node.declarations.some((decl) => decl.init);

                let firstVariable;
                if (printed.length === 1 && !hasComment(node.declarations[0])) {
                    firstVariable = printed[0];
                } else if (printed.length > 0) {
                    firstVariable = indent(printed[0]);
                }

                const parts: Doc = [
                    'var',
                    firstVariable ? [' ', firstVariable] : '',
                    indent(
                        printed
                            .slice(1)
                            .map((p) => [
                                ',',
                                hasValue ? hardline : line,
                                p,
                            ]),
                    )
                ];

                parts.push(';');

                return group(parts);
            }

            case 'var-declaration':
                return [group([path.call(print, 'name'), node.init ? [node.assign ? ' := ' : ' ', path.call(print, 'init')] : ''])];

            case 'function-call-expression':
                return functionCallLike(node, options, node.scope ? [path.call(print, 'scope'), '::'] : '', path, print);

            case 'method-call-expression':
                return functionCallLike(node, options, [path.call(print, 'entity'), '.'], path, print);

            case 'element-access-expression':
                return parenthesizeExpression(node, options,
                    [path.call(print, 'entity'), characterSpacing(false, // maybe options.bracketSpacing?
                        '[', join(', ', path.map(print, 'indexes')), ']'
                    )]
                );

            case 'return-statement':
                return ['return', node.expression ? [' ', path.call(print, 'expression')] : '', ';'];

            case 'unary-expression':
                if (node.prefix) {
                    return parenthesizeExpression(node, options,
                        [node.operator, node.operator.toLowerCase() === 'not' ? ' ' : '', path.call(print, 'argument')]
                    );
                } else {
                    return parenthesizeExpression(node, options,
                        [path.call(print, 'argument'), node.operator]
                    );
                }

            case 'member-access-expression':
                return parenthesizeExpression(node, options,
                    [path.call(print, 'entity'), '.', path.call(print, 'accessor')]
                );

            case 'function-declaration':
                return [
                    node.exported ? 'exported ' : '', 'function ', path.call(print, 'name'),
                    functionParametersLike(node, options, path, print),
                    body(node, options, path, print), 'endfunction'
                ];

            case 'function-parameter':
                return group([node.byref ? 'byref ' : '', node.unused ? 'unused ' : '', path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : '']);

            case 'dictionary-expression':
            case 'error-expression':
            case 'struct-expression':
            case 'array-expression':
            {
                const kind = node.type.substring(0, node.type.indexOf('-'));
                const explicit = (node.type === 'array-expression' && node.explicit) || node.type !== 'array-expression';
                if (node.short) {
                    return parenthesizeExpression(node, options, kind);
                } else {
                    const elements = node.elements.length === 0 ?
                        emptySpacing(options.emptyBracketSpacing, '{', '}') :
                        characterSpacing(options.bracketSpacing,
                            '{',
                            [
                                indent(
                                    ([
                                        softline,
                                        join(([',', line]), path.map(print, 'elements'))
                                    ])
                                ),
                                softline
                            ],
                            '}');

                    return parenthesizeExpression(node, options, [
                        explicit ? kind : '',
                        elements
                    ]);
                }
            }

            case 'dictionary-initializer':
                return [path.call(print, 'key'), node.init ? [' -> ', path.call(print, 'init')] : ''];

            case 'while-statement':
                return labelStatement(node, path, print, [
                    'while ',
                    characterSpacing(options.conditionalParenthesisSpacing, '(', path.call(print, 'test'), ')'),
                    body(node, options, path, print),
                    'endwhile'
                ]);

            case 'case-statement':
                return labelStatement(node, path, print, [
                    'case ',
                    characterSpacing(options.conditionalParenthesisSpacing, '(', path.call(print, 'test'), ')'),
                    body(node, options, path, print),
                    'endcase']
                );

            case 'switch-block':
                const labels: Doc = node.labels.map((_, index) => [(path as any).call(print, 'labels', index), ':']);
                return [
                    join(hardline, labels),
                    body(node, options, path, print, '')
                ];

            case 'default-case-label':
                return 'default';

            case 'foreach-statement':
                return labelStatement(node, path, print,
                    [
                        'foreach ', path.call(print, 'identifier'), ' in ', path.call(print, 'expression'),
                        body(node, options, path, print),
                        'endforeach'
                    ]
                );

            case 'cstyle-for-statement':
                return labelStatement(node, path, print,
                    [
                        'for ',
                        characterSpacing(options.conditionalParenthesisSpacing, '(', [path.call(print, 'initializer'), '; ', path.call(print, 'test'), '; ', path.call(print, 'advancer')], ')'),
                        body(node, options, path, print),
                        'endfor'
                    ]
                );

            case 'break-statement':
                return ['break', node.label ? [' ', path.call(print, 'label')] : '', ';'];

            case 'continue-statement':
                return ['continue', node.label ? [' ', path.call(print, 'label')] : '', ';'];

            case 'basic-for-statement':
                return labelStatement(node, path, print,
                    [
                        'for ', path.call(print, 'identifier'), ' := ', path.call(print, 'first'), ' to ', path.call(print, 'last'),
                        body(node, options, path, print),
                        'endfor'
                    ]
                );

            case 'conditional-expression':
                return parenthesizeExpression(node, options,
                    [path.call(print, 'conditional'), ' ? ', (path as any).call(print, 'consequent'), ' : ', path.call(print, 'alternate')]
                );

            case 'do-statement':
                return labelStatement(node, path, print,
                    [
                        'do',
                        body(node, options, path, print),
                        'dowhile (', path.call(print, 'test'), ');']
                );

            case 'struct-initializer':
                return [path.call(print, 'name'), node.init ? [' := ', path.call(print, 'init')] : ''];

            case 'exit-statement':
                return 'exit;';

            case 'function-reference-expression':
                return parenthesizeExpression(node, options,
                    ['@', path.call(print, 'name')]
                );

            case 'goto-statement':
                return ['goto ', path.call(print, 'label'), ';'];

            case 'interpolated-string-expression':
                return parenthesizeExpression(node, options,
                    ['$"', path.map(print, 'parts'), '"']
                );

            case 'interpolated-string-part':
                const addBraces = !node.literal;
                return [addBraces ? '{' : '', path.call(print, 'expression'), node.format ? [':', node.format] : '', addBraces ? '}' : ''];

            case 'repeat-statement':
                return labelStatement(node, path, print,
                    [
                        'repeat',
                        body(node, options, path, print),
                        'until ', path.call(print, 'test'), ';'
                    ]
                );

            case 'empty-statement':
                return ';';

            default:
                throw new Error(`Unhandled node type ${node.type} at ${node.start.line_number}:${node.start.character_column}`);
            }
        },
    },
};

export interface EscriptPrettierPluginOptions extends RequiredOptions, ParserOptions {
    conditionalParenthesisSpacing: boolean
    emptyBracketSpacing: boolean
    emptyParenthesisSpacing: boolean
    otherParenthesisSpacing: boolean
}

export const defaultOptions = {
    conditionalParenthesisSpacing: true,
    emptyBracketSpacing: false,
    emptyParenthesisSpacing: false,
    otherParenthesisSpacing: false
};

export const options: Plugin<ASTNode>['options'] = {
    conditionalParenthesisSpacing: {
        name: 'conditionalParenthesisSpacing',
        type: 'boolean',
        category: 'Escript',
        description: 'Put a space in parentheses only inside conditional statements (for/if/while/switch...).',
        default: defaultOptions.conditionalParenthesisSpacing
    },
    emptyParenthesisSpacing: {
        name: 'emptyParenthesisSpacing',
        type: 'boolean',
        category: 'Escript',
        description: 'Put a space in parentheses only if the parentheses are empty i.e. \'()\'.',
        default: defaultOptions.emptyParenthesisSpacing
    },
    emptyBracketSpacing: {
        name: 'emptyBracketSpacing',
        type: 'boolean',
        category: 'Escript',
        description: 'Put a space in brackets only if the brackets are empty i.e. \'{}\'.',
        default: defaultOptions.emptyBracketSpacing
    },
    otherParenthesisSpacing: {
        name: 'otherParenthesisSpacing',
        type: 'boolean',
        category: 'Escript',
        description: 'Put a space in brackets only if the brackets are empty i.e. \'{}\'.',
        default: defaultOptions.otherParenthesisSpacing
    }
};

const plugin: Plugin<ASTNode> = {
    languages, parsers, printers, defaultOptions, options
};

export default plugin;
