/* eslint-disable */
import { inspect } from 'util';
import { CommonTokenStream, Token, ParserRuleContext } from 'antlr4ts';
import { EscriptLexer, EscriptLooseParserVisitor } from 'escript-antlr4';
// const { ConstStatementContext, ModuleDeclarationStatementContext, ModuleFunctionDeclarationContext, VariableDeclarationContext, CompilationUnitContext, ModuleUnitContext, UnitExpressionContext, TopLevelDeclarationContext, FunctionDeclarationContext, StringIdentifierContext, UseDeclarationContext, IncludeDeclarationContext, ProgramDeclarationContext, StatementContext, IfStatementContext, GotoStatementContext, ReturnStatementContext, VarStatementContext, DoStatementContext, WhileStatementContext, ExitStatementContext, DeclareStatementContext, BreakStatementContext, ContinueStatementContext, ForStatementContext, ForeachStatementContext, RepeatStatementContext, CaseStatementContext, EnumStatementContext, BlockContext, VariableDeclarationInitializerContext, EnumListContext, EnumListEntryContext, SwitchBlockStatementGroupContext, SwitchLabelContext, ForGroupContext, BasicForStatementContext, CstyleForStatementContext, IdentifierListContext, VariableDeclarationListContext, ProgramParametersContext, ProgramParameterListContext, ProgramParameterContext, FunctionParametersContext, FunctionParameterListContext, FunctionParameterContext, ScopedMethodCallContext, ExpressionContext, PrimaryContext, ParExpressionContext, ExpressionListContext, MethodCallContext, StructInitializerExpressionContext, StructInitializerExpressionListContext, StructInitializerContext, DictInitializerExpressionContext, DictInitializerExpressionListContext, DictInitializerContext, ArrayInitializerContext, LiteralContext, IntegerLiteralContext, FloatLiteralContext, ModuleFunctionParameterContext, ModuleFunctionParameterListContext, MemberCallContext, MethodCallArgumentListContext, MethodCallArgumentContext } = strict;
// ConstStatementContext, ModuleDeclarationStatementContext, ModuleFunctionDeclarationContext, VariableDeclarationContext, CompilationUnitContext, ModuleUnitContext, UnitExpressionContext, TopLevelDeclarationContext, FunctionDeclarationContext, StringIdentifierContext, UseDeclarationContext, IncludeDeclarationContext, ProgramDeclarationContext, StatementContext, IfStatementContext, GotoStatementContext, ReturnStatementContext, VarStatementContext, DoStatementContext, WhileStatementContext, ExitStatementContext, DeclareStatementContext, BreakStatementContext, ContinueStatementContext, ForStatementContext, ForeachStatementContext, RepeatStatementContext, CaseStatementContext, EnumStatementContext, BlockContext, VariableDeclarationInitializerContext, EnumListContext, EnumListEntryContext, SwitchBlockStatementGroupContext, SwitchLabelContext, ForGroupContext, BasicForStatementContext, CstyleForStatementContext, IdentifierListContext, VariableDeclarationListContext, ProgramParametersContext, ProgramParameterListContext, ProgramParameterContext, FunctionParametersContext, FunctionParameterListContext, FunctionParameterContext, ScopedMethodCallContext, ExpressionContext, PrimaryContext, ParExpressionContext, ExpressionListContext, MethodCallContext, StructInitializerExpressionContext, StructInitializerExpressionListContext, StructInitializerContext, DictInitializerExpressionContext, DictInitializerExpressionListContext, DictInitializerContext, ArrayInitializerContext, LiteralContext, IntegerLiteralContext, FloatLiteralContext, ModuleFunctionParameterContext, ModuleFunctionParameterListContext, MemberCallContext, MethodCallArgumentListContext, MethodCallArgumentContext } from 'escript-antlr4';
import * as ast from './ast-types';
import { AbstractParseTreeVisitor, TerminalNode, ParseTree, ErrorNode } from 'antlr4ts/tree';
import { Location, Range } from 'vscode-languageserver'
import { extname } from 'path';
import { ModuleFunctionParameterContext, StatementContext, ReturnStatementContext, VariableDeclarationInitializerContext, EnumListEntryContext, ProgramParameterContext, FunctionParameterContext, PrimaryContext, StructInitializerExpressionContext, UnitExpressionContext, ForeachStatementContext, RepeatStatementContext, CaseStatementContext, ParExpressionContext, MethodCallArgumentContext, BasicForStatementContext, CstyleForStatementContext, ExpressionContext, ExpressionListContext, DictInitializerExpressionContext, CompilationUnitContext, ModuleUnitContext, ModuleDeclarationStatementContext, ModuleFunctionDeclarationContext, ConstStatementContext, ModuleFunctionParameterListContext, TopLevelDeclarationContext, UseDeclarationContext, IncludeDeclarationContext, ProgramDeclarationContext, FunctionDeclarationContext, StringIdentifierContext, IfStatementContext, GotoStatementContext, VarStatementContext, DoStatementContext, WhileStatementContext, ExitStatementContext, DeclareStatementContext, BreakStatementContext, ContinueStatementContext, ForStatementContext, EnumStatementContext, BlockContext, EnumListContext, SwitchBlockStatementGroupContext, SwitchLabelContext, IntegerLiteralContext, ForGroupContext, VariableDeclarationListContext, VariableDeclarationContext, ProgramParametersContext, ProgramParameterListContext, FunctionParametersContext, FunctionParameterListContext, ScopedMethodCallContext, StructInitializerContext, MemberCallContext, ArrayInitializerContext, MethodCallContext, LiteralContext, MethodCallArgumentListContext, StructInitializerExpressionListContext, DictInitializerExpressionListContext, DictInitializerContext, FloatLiteralContext } from './EscriptParserImpl';

inspect.defaultOptions.depth = Infinity;

type CommentExtension = Pick<ast.Node, 'leadingComments' | 'trailingComments' | 'range'>

type Node = Omit<ast.Node, keyof CommentExtension>
type Program = Omit<ast.Program, keyof CommentExtension>;
type ImportDeclaration = Omit<ast.ImportDeclaration, keyof CommentExtension>;
type StringLiteral = Omit<ast.StringLiteral, keyof CommentExtension>;
type VariableDeclaration = Omit<ast.VariableDeclaration, keyof CommentExtension>;
type VariableDeclarator = Omit<ast.VariableDeclarator, keyof CommentExtension>;
type ArrayExpression = Omit<ast.ArrayExpression, keyof CommentExtension>;
type BinaryExpression = Omit<ast.BinaryExpression, keyof CommentExtension>;
type NumericLiteral = Omit<ast.NumericLiteral, keyof CommentExtension>;
type MemberExpression = Omit<ast.MemberExpression, keyof CommentExtension>;
type BracketExpression = Omit<ast.BracketExpression, keyof CommentExtension>;

type MethodCallExpression = Omit<ast.MethodCallExpression, keyof CommentExtension>;
type StructExpression = Omit<ast.StructExpression, keyof CommentExtension>;
type StructProperty = Omit<ast.StructProperty, keyof CommentExtension>;
type DictExpression = Omit<ast.DictExpression, keyof CommentExtension>;
type DictProperty = Omit<ast.DictProperty, keyof CommentExtension>;
type ErrorExpression = Omit<ast.ErrorExpression, keyof CommentExtension>;
type ErrorProperty = Omit<ast.ErrorProperty, keyof CommentExtension>;
type FunctionExpression = Omit<ast.FunctionExpression, keyof CommentExtension>;
type UpdateExpression = Omit<ast.UpdateExpression, keyof CommentExtension>;
type IfStatement = Omit<ast.IfStatement, keyof CommentExtension>;
type BlockStatement = Omit<ast.BlockStatement, keyof CommentExtension>;
type ExpressionStatement = Omit<ast.ExpressionStatement, keyof CommentExtension>;
type ReturnStatement = Omit<ast.ReturnStatement, keyof CommentExtension>;
type DoWhileStatement = Omit<ast.DoWhileStatement, keyof CommentExtension>;
type WhileStatement = Omit<ast.WhileStatement, keyof CommentExtension>;
type BreakStatement = Omit<ast.BreakStatement, keyof CommentExtension>;
type ForStatement = Omit<ast.CstyleForStatement, keyof CommentExtension>;
type SwitchStatement = Omit<ast.SwitchStatement, keyof CommentExtension>;
type FunctionDeclaration = Omit<ast.FunctionDeclaration, keyof CommentExtension>;
type FunctionArgument = Omit<ast.FunctionArgument, keyof CommentExtension>;
type ContinueStatement = Omit<ast.ContinueStatement, keyof CommentExtension>;
type ForOfStatement = Omit<ast.ForOfStatement, keyof CommentExtension>;
type SwitchCase = Omit<ast.SwitchCase, keyof CommentExtension>;
type UnaryExpression = Omit<ast.UnaryExpression, keyof CommentExtension>;
type EnumStatement = Omit<ast.EnumStatement, keyof CommentExtension>;
type EnumEntry = Omit<ast.EnumEntry, keyof CommentExtension>;
type ForToStatement = Omit<ast.ForToStatement, keyof CommentExtension>;
type CstyleForStatement = Omit<ast.CstyleForStatement, keyof CommentExtension>;
type RepeatStatement = Omit<ast.RepeatStatement, keyof CommentExtension>;
type ModuleFunctionDeclaration = Omit<ast.ModuleFunctionDeclaration, keyof CommentExtension>;
type ModuleFunctionArgument = Omit<ast.ModuleFunctionArgument, keyof CommentExtension>;
type ProgramDeclaration = Omit<ast.ProgramDeclaration, keyof CommentExtension>;
type ProgramArgument = Omit<ast.ProgramArgument, keyof CommentExtension>;
type ScopedCallExpression = Omit<ast.ScopedCallExpression, keyof CommentExtension>;
type ExitStatement = Omit<ast.ExitStatement, keyof CommentExtension>;
type LabeledStatement = Omit<ast.LabeledStatement, keyof CommentExtension>;
type EmptyStatement = Omit<ast.EmptyStatement, keyof CommentExtension>;
type AssignStatement = Omit<ast.AssignStatement, keyof CommentExtension>;
type InvalidExpression = Omit<ast.InvalidExpression, keyof CommentExtension>;
type MemberCallExpression = Omit<ast.MemberCallExpression, keyof CommentExtension>;
type MethodCallArgument = Omit<ast.MethodCallArgument, keyof CommentExtension>;
type SequenceExpression = Omit<ast.SequenceExpression, keyof CommentExtension>;


function getEndPos(token: Token): { line: number, character: number } {
    let { line, charPositionInLine: character } = token;
    const str = token.text ?? '';
    --line;
    for (let i = 0; i < str.length - 1; i++) {
        if (str[i] === '\r' && str[i + 1] === '\n') ++line, character = 1;
        else if (str[i] === '\r') ++line, character = 1;
        else if (str[i] === '\n') ++line, character = 1;
        else ++character;
    }
    ++character;
    return { line, character };
}

type ResultA = ast.Node | ast.Node[];
type Result = ResultA;

enum ErrorType {
    NOT_FOUND,
    DUPLICATE,
    DEPENDENCY
};


const tokensToRange = (start: Token, end = start): Range => {
    return {
        start: {
            line: start.line - 1,
            character: start.charPositionInLine
        },
        end: getEndPos(end)
    };
};

type ExprOrUndefined = ModuleFunctionParameterContext | StatementContext | ReturnStatementContext | VariableDeclarationInitializerContext | EnumListEntryContext | ProgramParameterContext | FunctionParameterContext | PrimaryContext | StructInitializerExpressionContext
type Expr = UnitExpressionContext | ForeachStatementContext | RepeatStatementContext | CaseStatementContext | ParExpressionContext | MethodCallArgumentContext;
type ExprList = BasicForStatementContext | CstyleForStatementContext | ExpressionContext | ExpressionListContext | DictInitializerExpressionContext;

function safeExpression<T extends ExprOrUndefined>(ctx: T, previous: Range): ExpressionContext | undefined | InvalidExpressionError;
function safeExpression<T extends Expr>(ctx: T, previous: Range): ExpressionContext | InvalidExpressionError;
// function safeExpression<T extends UnitExpressionContext | ForeachStatementContext | RepeatStatementContext | CaseStatementContext | ParExpressionContext | MethodCallArgumentContext>(ctx: T, previous: Range): ExpressionContext | InvalidExpressionError;

/**
 * expr or undefined
 *  
 * 
 * expr
 * 
 *  
 * expr[]
 *  

 */
function safeExpression<T extends ExprOrUndefined | Expr>(ctx: T, previous: Range): ExpressionContext | undefined | InvalidExpressionError {
    try {
        return ctx.expression();
        // return arguments.length === 2 ? ctx.expression() : (ctx as ExprList).expression(index);
    } catch {
        return new InvalidExpressionError(previous);
    }
}

function safeIdentifier(ctx: VariableDeclarationContext) {
    try {
        return ctx.IDENTIFIER();
    } catch {
        return null;
    }
}

class InvalidExpressionError extends Error {
    constructor(public range: Range) {
        super();
    }
}

export interface SemanticError {
    what: string;
    where: Range;
    type: ErrorType
    reference?: Location;
}

interface ExpressionableContext extends ParserRuleContext {
    expression(index?: number): ExpressionContext | undefined
}
export default class EscriptParserVisitorImpl extends AbstractParseTreeVisitor<Result> implements EscriptLooseParserVisitor<Result> {

    constructor(private uri: string, private tokens: CommonTokenStream, private fullParse = true) {
        super();
    }

    public static find(root: ast.Node, where: Position): ast.Node {
        let current = root;
        return current;
    }

    protected defaultResult(): never {
        throw new Error('Nothing should ever have a default result');
    }

    protected aggregateResult(aggregate: Result, nextResult: Result): never {
        throw new Error('Aggregation should not occur here');
    }

    public process(tree: ParseTree): ast.Program {
        const res = this.visit(tree);
        const res2 = Array.isArray(res) ? res[0] : res;
        if (res2.type === "Program") {
            return res2;
        }
        throw new Error(`Unknown root node to process ${res2.type}`);
    }


    comment<T extends Node>(node: T, startToken: Token, endToken = startToken): (T & CommentExtension) {
        const text = startToken.text;
        if (!text) throw new Error('Token has no text');
        else if (!node) throw new Error('No node to augment');
        const comments: CommentExtension = {
            leadingComments: null,
            trailingComments: null,
            range: tokensToRange(startToken, endToken)
        };

        for (const run of [0, 1]) {
            const hiddenTokens = run === 0 ?
                (startToken.tokenIndex !== -1 ? this.tokens.getHiddenTokensToLeft(startToken.tokenIndex, EscriptLexer.COMMENTS) : [])
                : (endToken && endToken.tokenIndex !== -1 ? this.tokens.getHiddenTokensToRight(endToken.tokenIndex, EscriptLexer.COMMENTS) : []);

            comments[run === 0 ? 'leadingComments' : 'trailingComments'] = hiddenTokens.reduce((prev, token) => {
                const text = token.text ?? '';
                const type =
                    token.type === EscriptLexer.LINE_COMMENT ? { type: 'CommentLine' as const, value: text.substr(2) } :
                        token.type === EscriptLexer.COMMENT ? { type: 'CommentBlock' as const, value: text.substring(3, text.length - 2) } : undefined;

                if (!type) return prev;
                if (!prev) prev = [];
                try {
                    prev.push({
                        ...type,
                        range: tokensToRange(token)
                    });
                    return prev;
                } catch {
                    return prev;
                }
            }, null as ast.Comment[] | null)
        }
        return { ...node, ...comments };
    }

    commentNode<Type extends string, K extends symbol | string | number, T extends { type: Type } & { [key in K]: string }>(type: Type, key: K, node: TerminalNode) {
        let { text } = node;
        return {
            type,
            [key]: text.startsWith('"') ? text.substring(1, text.length - 1) : text
        } as T;
    }

    getIdentifierr(node: TerminalNode): ast.Identifier {
        return this.comment({
            ...this.commentNode("Identifier", "name", node),
            decorators: null,
            optional: null,
            typeAnnotation: null
        }, node.symbol);
    }

    safeGetIdentifier<T extends { IDENTIFIER(): TerminalNode, start: Token, stop?: Token }>(ctx: T): ast.Identifier {
        // const node =  return ctx.IDENTIFIER(); safeIdentifier(ctx);
        let node: TerminalNode | undefined;
        try {
            node = ctx.IDENTIFIER();
        } catch {
            node = undefined;
        }

        if (node && !(node instanceof ErrorNode)) {
            return this.comment({
                ...this.commentNode("Identifier", "name", node)
            }, node.symbol);
        } else {
            const x: ast.Identifier = {
                type: 'Identifier',
                name: '',
                leadingComments: null,
                trailingComments: null,
                range: tokensToRange(ctx.start, ctx.stop)
            }
            return x;
        }
    }

    getStringLiteral(term: TerminalNode): ast.StringLiteral {
        const x: StringLiteral = {
            type: 'StringLiteral',
            value: term.text.substring(1, term.text.length - 1)
        };
        return this.comment(x, term.symbol);
    }

    visitCompilationUnit(ctx: CompilationUnitContext): ast.Program {
        const tlds = ctx.topLevelDeclaration();
        const expr = ctx.unitExpression();

        let body: ast.Statement[] = [];
        for (const tld of tlds) {
            body.push(this.visitTopLevelDeclaration(tld));
        }
        if (expr) {
            const x = this.visitUnitExpression(expr);
            body.push(this.comment(x, ctx.start, ctx.stop));
        }

        const x: Program = {
            type: "Program",
            body,
            sourceType: extname(this.uri).toLowerCase().endsWith('.inc') ? 'include' : 'script',
            sourceFile: this.uri
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitModuleUnit(ctx: ModuleUnitContext): ast.Program {
        const x: Program = {
            type: "Program",
            body: ctx.moduleDeclarationStatement().map(x => this.visitModuleDeclarationStatement(x)),
            sourceType: "module",
            sourceFile: this.uri
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitModuleDeclarationStatement(ctx: ModuleDeclarationStatementContext): ast.Statement {
        let child: ModuleFunctionDeclarationContext | ConstStatementContext | undefined;
        if ((child = ctx.moduleFunctionDeclaration())) {
            return this.visitModuleFunctionDeclaration(child);
        } else if ((child = ctx.constStatement())) {
            return this.visitConstStatement(child);
        } else {
            return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
        }
    }

    visitModuleFunctionDeclaration(ctx: ModuleFunctionDeclarationContext): ast.ModuleFunctionDeclaration {
        const child = ctx.moduleFunctionParameterList();
        const id = this.safeGetIdentifier(ctx);

        /** @TODO figure out annotation */
        const annotation = undefined;
        const x: ModuleFunctionDeclaration = {
            type: 'ModuleFunctionDeclaration',
            id,
            params: child ? this.visitModuleFunctionParameterList(child) : []
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitModuleFunctionParameterList(ctx: ModuleFunctionParameterListContext): ast.ModuleFunctionArgument[] {
        return ctx.moduleFunctionParameter().map(x => this.visitModuleFunctionParameter(x));
    }

    visitModuleFunctionParameter(ctx: ModuleFunctionParameterContext): ast.ModuleFunctionArgument {
        const child = ctx.expression();
        const x: ModuleFunctionArgument = {
            type: 'ModuleFunctionArgument',
            id: this.safeGetIdentifier(ctx),
            init: child ? this.visitExpression(child) : null
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitUnitExpression(ctx: UnitExpressionContext): ast.ExpressionStatement {

        return this.comment({
            type: "ExpressionStatement",
            expression: this.visitExpression(ctx.expression()),
            terminated: true
        }, ctx.start);
    }

    visitTopLevelDeclaration(ctx: TopLevelDeclarationContext): ast.Statement {
        let child: UseDeclarationContext |
            IncludeDeclarationContext |
            ProgramDeclarationContext |
            FunctionDeclarationContext |
            StatementContext |
            undefined;
        if ((child = ctx.useDeclaration())) {
            return this.visitUseDeclaration(child);
        } else if ((child = ctx.includeDeclaration())) {
            return this.visitIncludeDeclaration(child);
        } else if ((child = ctx.programDeclaration())) {
            return this.visitProgramDeclaration(child);
        } else if ((child = ctx.functionDeclaration())) {
            return this.visitFunctionDeclaration(child);
        } else if ((child = ctx.statement())) {
            return this.visitStatement(child);
        }

        return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
    }

    visitFunctionDeclaration(ctx: FunctionDeclarationContext): ast.FunctionDeclaration {
        const x: FunctionDeclaration = {
            type: 'FunctionDeclaration',
            params: this.visitFunctionParameters(ctx.functionParameters()),
            body: this.fullParse ? this.visitBlock(ctx.block()) : null,
            id: this.safeGetIdentifier(ctx),
            exported: Boolean(ctx.EXPORTED()),
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitStringIdentifier(ctx: StringIdentifierContext): ast.StringLiteral | ast.Identifier | ast.InvalidExpression {
        let term: TerminalNode | undefined;
        if ((term = ctx.IDENTIFIER())) {
            return this.getIdentifierr(term);
        } else if ((term = ctx.STRING_LITERAL())) {
            return this.getStringLiteral(term);
        } else {
            const x: InvalidExpression = {
                type: 'InvalidExpression'
            };
            return this.comment(x, ctx.start, ctx.stop);
        }
    }

    visitUseDeclaration(ctx: UseDeclarationContext): ast.ImportDeclaration {
        const child = ctx.stringIdentifier();
        const x: ImportDeclaration = {
            type: 'ImportDeclaration',
            importKind: 'module',
            source: this.visitStringIdentifier(child)
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitIncludeDeclaration(ctx: IncludeDeclarationContext): ast.ImportDeclaration {
        const child = ctx.stringIdentifier();
        const x: ImportDeclaration = {
            type: 'ImportDeclaration',
            importKind: 'include',
            source: this.visitStringIdentifier(child)
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitProgramDeclaration(ctx: ProgramDeclarationContext): ast.ProgramDeclaration {
        const x: ProgramDeclaration = {
            type: 'ProgramDeclaration',
            body: this.visitBlock(ctx.block()),
            id: this.safeGetIdentifier(ctx),
            params: this.visitProgramParameters(ctx.programParameters())
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitStatement(ctx: StatementContext): ast.Statement {
        let child: IfStatementContext |
            GotoStatementContext |
            ReturnStatementContext |
            ConstStatementContext |
            VarStatementContext |
            DoStatementContext |
            WhileStatementContext |
            ExitStatementContext |
            DeclareStatementContext |
            BreakStatementContext |
            ContinueStatementContext |
            ForStatementContext |
            ForeachStatementContext |
            RepeatStatementContext |
            CaseStatementContext |
            EnumStatementContext |
            ExpressionContext |
            StatementContext |
            EmptyStatement |
            undefined;

        let term: TerminalNode | undefined;

        /** @TODO full parse should skip non-important statements */
        if ((child = ctx.constStatement())) {
            return this.visitConstStatement(child);
        } else if ((child = ctx.varStatement())) {
            return this.visitVarStatement(child);
        } else if ((child = ctx.enumStatement())) {
            return this.visitEnumStatement(child);
        } else if (this.fullParse) {
            if ((child = ctx.ifStatement())) {
                return this.visitIfStatement(child);
            } else if ((child = ctx.gotoStatement())) {
                return this.visitGotoStatement(child);
            } else if ((child = ctx.returnStatement())) {
                return this.visitReturnStatement(child);
            } else if ((child = ctx.doStatement())) {
                return this.visitDoStatement(child);
            } else if ((child = ctx.whileStatement())) {
                return this.visitWhileStatement(child);
            } else if ((child = ctx.exitStatement())) {
                return this.visitExitStatement(child);
            } else if ((child = ctx.declareStatement())) {
                return this.visitDeclareStatement(child);
            } else if ((child = ctx.breakStatement())) {
                return this.visitBreakStatement(child);
            } else if ((child = ctx.continueStatement())) {
                return this.visitContinueStatement(child);
            } else if ((child = ctx.forStatement())) {
                return this.visitForStatement(child);
            } else if ((child = ctx.foreachStatement())) {
                return this.visitForeachStatement(child);
            } else if ((child = ctx.repeatStatement())) {
                return this.visitRepeatStatement(child);
            } else if ((child = ctx.caseStatement())) {
                return this.visitCaseStatement(child);
            } else if ((child = ctx._statementExpression)) {
                const expression = this.visitExpression(child);
                if (expression.type === 'BinaryExpression' && expression.operator === ':=') {
                    if (expression.left.type === 'Identifier' || expression.left.type === 'MemberExpression') {
                        const x: AssignStatement = {
                            type: 'AssignStatement',
                            operator: expression.operator,
                            left: expression.left,
                            right: expression.right
                        }
                        return this.comment(x, ctx.start, ctx.stop);
                    }
                }
                const x: ExpressionStatement = {
                    type: 'ExpressionStatement',
                    expression,
                    terminated: true // !ctx.missingTerminator()
                };
                return this.comment(x, ctx.start, ctx.stop);
            } else if ((term = ctx.SEMI())) {
                const x: EmptyStatement = {
                    type: 'EmptyStatement'
                }
                return this.comment(x, ctx.start, ctx.stop);
            } else if ((child = ctx.statement()) && (term = ctx.IDENTIFIER())) {

                const x: LabeledStatement = {
                    type: 'LabeledStatement',
                    body: this.visitStatement(child),
                    label: this.getIdentifierr(term)
                }
                return this.comment(x, ctx.start, ctx.stop);
            }
        }

        const x: EmptyStatement = {
            type: 'EmptyStatement'
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitIfStatement(ctx: IfStatementContext): ast.IfStatement | ast.InvalidStatement {
        try {
            const exprs = ctx.parExpression();
            const thenBlock = ctx.block(0);
            const elseifTerms = ctx.ELSEIF();
            const elseifs = ctx.parExpression().slice(1);
            const elseifBlocks = ctx.block().slice(1);
            const rootIf: ast.IfStatement = this.comment({
                type: 'IfStatement',
                test: this.visitParExpression(exprs[0]),
                consequent: this.visitBlock(thenBlock),
                alternate: null
            }, ctx.start, ctx.stop);

            let currentIf = rootIf;

            elseifs.forEach((elseif, index) => {
                try {
                    const x: ast.IfStatement = this.comment({
                        type: 'IfStatement',
                        test: this.visitParExpression(elseif),
                        consequent: this.visitBlock(elseifBlocks[index]),
                        alternate: null
                    }, elseifTerms[index].symbol, ctx.stop)
                    currentIf.alternate = x;
                    currentIf = x;
                } catch {
                    /** @TODO do we need to handle this here...? */
                }
            });

            if (ctx.ELSE()) {
                currentIf.alternate = this.visitBlock(elseifBlocks[elseifBlocks.length - 1]);
            }

            return rootIf;
        } catch {
            return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
        }
    }

    visitGotoStatement(ctx: GotoStatementContext): ast.InvalidStatement {
        return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
    }

    visitReturnStatement(ctx: ReturnStatementContext): ast.ReturnStatement {
        const child = ctx.expression();
        const x: ReturnStatement = {
            type: 'ReturnStatement',
            argument: child ? this.visitExpression(child) : null
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitConstStatement(ctx: ConstStatementContext): ast.VariableDeclaration {
        const x: VariableDeclaration = {
            type: 'VariableDeclaration',
            declarations: [this.visitVariableDeclaration(ctx.variableDeclaration())],
            kind: "const"
        }
        return this.comment(x, ctx.start, ctx.stop);
    };

    visitVarStatement(ctx: VarStatementContext): ast.VariableDeclaration {
        const x: VariableDeclaration = {
            type: 'VariableDeclaration',
            declarations: this.visitVariableDeclarationList(ctx.variableDeclarationList()),
            kind: "var"
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitDoStatement(ctx: DoStatementContext): ast.DoWhileStatement {
        const x: DoWhileStatement = {
            type: 'DoWhileStatement',
            test: this.visitExpression(ctx.parExpression().expression()),
            body: this.visitBlock(ctx.block())
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitWhileStatement(ctx: WhileStatementContext): ast.WhileStatement {
        const x: WhileStatement = {
            type: 'WhileStatement',
            test: this.visitExpression(ctx.parExpression().expression()),
            body: this.visitBlock(ctx.block())
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitExitStatement(ctx: ExitStatementContext): ast.ExitStatement {
        const x: ExitStatement = {
            type: 'ExitStatement'
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitDeclareStatement(ctx: DeclareStatementContext): ast.InvalidStatement {
        return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
    }

    visitBreakStatement(ctx: BreakStatementContext): ast.BreakStatement {
        const child = ctx.IDENTIFIER();
        const x: BreakStatement = {
            type: 'BreakStatement',
            label: child ? this.getIdentifierr(child) : null
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitContinueStatement(ctx: ContinueStatementContext): ast.ContinueStatement {
        const child = ctx.IDENTIFIER();
        const x: ContinueStatement = {
            type: 'ContinueStatement',
            label: child ? this.getIdentifierr(child) : null
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitForStatement(ctx: ForStatementContext): ast.ForStatement | ast.InvalidStatement {
        return this.visitForGroup(ctx.forGroup());
    }

    visitForeachStatement(ctx: ForeachStatementContext): ast.ForOfStatement {
        const x: ForOfStatement = {
            type: 'ForOfStatement',
            left: this.safeGetIdentifier(ctx),
            right: this.visitExpression(ctx.expression()),
            body: this.visitBlock(ctx.block())
        }
        const results = this.comment(x, ctx.start, ctx.stop);
        return results;
    }

    visitRepeatStatement(ctx: RepeatStatementContext): ast.RepeatStatement {
        const x: RepeatStatement = {
            type: 'RepeatStatement',
            test: this.visitExpression(ctx.expression()),
            body: this.visitBlock(ctx.block())
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitCaseStatement(ctx: CaseStatementContext): ast.SwitchStatement {
        const x: SwitchStatement = {
            type: "SwitchStatement",
            discriminant: this.visitExpression(ctx.expression()),
            cases: ctx.switchBlockStatementGroup().reduce((p, c) => p.concat(this.visitSwitchBlockStatementGroup(c)), [] as (ast.SwitchCase | ast.InvalidStatement)[])
        };
        // new CaseStatementContext(ctx, 0);
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitEnumStatement(ctx: EnumStatementContext): ast.EnumStatement {
        const child = ctx.enumList();
        const x: EnumStatement = {
            type: "EnumStatement",
            id: this.safeGetIdentifier(ctx),
            decls: child ? this.visitEnumList(ctx.enumList()) : []
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitBlock(ctx: BlockContext): ast.BlockStatement {
        const x: BlockStatement = {
            type: "BlockStatement",
            body: ctx.children ? (ctx.children as StatementContext[]).map(stmt => this.visitStatement(stmt)) : []
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitVariableDeclarationInitializer(ctx: VariableDeclarationInitializerContext): ast.Expression {
        const child = ctx.expression() || ctx.ASSIGN();
        if (child instanceof ExpressionContext) {
            return this.visitExpression(child);
        } else {
            const x: ArrayExpression = {
                type: "ArrayExpression",
                elements: []
            };
            return this.comment(x, ctx.start, ctx.stop);
        }
    }


    visitEnumList(ctx: EnumListContext): ast.EnumEntry[] {
        return ctx.enumListEntry().map(x => this.visitEnumListEntry(x));
    }

    visitEnumListEntry(ctx: EnumListEntryContext): ast.EnumEntry {
        const child = ctx.expression();
        const x: EnumEntry = {
            type: "EnumEntry",
            id: this.safeGetIdentifier(ctx),
            value: child ? this.visitExpression(child) : null
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitSwitchBlockStatementGroup(ctx: SwitchBlockStatementGroupContext): (ast.SwitchCase | ast.InvalidStatement)[] {
        const labels = ctx.switchLabel().map(x => this.visitSwitchLabel(x));
        const lastLabel = labels[labels.length - 1];
        if (lastLabel.type === 'SwitchCase') {
            lastLabel.consequent = this.visitBlock(ctx.block()).body;
            lastLabel.range.end = { ...(lastLabel.consequent[0]?.range.end ?? lastLabel.range.end) };
        }
        return labels;
    }

    visitSwitchLabel(ctx: SwitchLabelContext): ast.SwitchCase | ast.InvalidStatement {
        let term: TerminalNode | undefined;
        let test: ast.Expression | null | undefined;
        let child: IntegerLiteralContext | undefined;

        if ((term = ctx.IDENTIFIER())) {
            test = this.getIdentifierr(term);
        } else if ((term = ctx.STRING_LITERAL())) {
            test = this.getStringLiteral(term);
        } else if (ctx.DEFAULT()) {
            test = null;
        } else if ((child = ctx.integerLiteral())) {
            test = this.visitIntegerLiteral(child);
        }

        if (test === undefined) {
            return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
        }

        const x: SwitchCase = {
            type: "SwitchCase",
            test,
            consequent: [] // filled by visitSwitchBlockStatementGroup
        };
        return this.comment(x, ctx.start, ctx.stop);
    };

    visitForGroup(ctx: ForGroupContext): ast.ForStatement | ast.InvalidStatement {
        let child: CstyleForStatementContext | BasicForStatementContext | undefined;

        if ((child = ctx.cstyleForStatement())) {
            return this.visitCstyleForStatement(child);
        } else if ((child = ctx.basicForStatement())) {
            return this.visitBasicForStatement(child);
        }
        return this.comment({ type: 'InvalidStatement' }, ctx.start, ctx.stop);
    }

    visitBasicForStatement(ctx: BasicForStatementContext): ast.ForToStatement {
        // this.safeExpression(ctx, tokensToRange(ctx.TO().symbol));

        const x: ForToStatement = {
            type: "ForToStatement",
            id: this.safeGetIdentifier(ctx),
            from: this.visitExpression(ctx.expression(0)),
            to: this.visitExpression(ctx.expression(1)),
            body: this.visitBlock(ctx.block())
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitCstyleForStatement(ctx: CstyleForStatementContext): ast.CstyleForStatement {
        const exprs = ctx.expression();
        const x: CstyleForStatement = {
            type: "CstyleForStatement",
            init: this.visitExpression(exprs[0]),
            test: this.visitExpression(exprs[1]),
            update: this.visitExpression(exprs[2]),
            body: this.visitBlock(ctx.block())
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitVariableDeclarationList(ctx: VariableDeclarationListContext): ast.VariableDeclarator[] {
        return ctx.variableDeclaration().map(x => this.visitVariableDeclaration(x));
    }

    visitVariableDeclaration(ctx: VariableDeclarationContext): ast.VariableDeclarator {
        const initializer = ctx.variableDeclarationInitializer();

        const x: VariableDeclarator = {
            type: 'VariableDeclarator',
            id: this.safeGetIdentifier(ctx),
            init: initializer ? this.visitVariableDeclarationInitializer(initializer) : null
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitProgramParameters(ctx: ProgramParametersContext): ast.ProgramArgument[] {
        const child = ctx.programParameterList();
        return child ? this.visitProgramParameterList(child) : [];
    }

    visitProgramParameterList(ctx: ProgramParameterListContext): ast.ProgramArgument[] {
        return ctx.programParameter().map(x => this.visitProgramParameter(x));
    }

    visitProgramParameter(ctx: ProgramParameterContext): ast.ProgramArgument {
        const child = ctx.expression();
        const x: ProgramArgument = {
            type: 'ProgramArgument',
            id: this.safeGetIdentifier(ctx),
            init: child ? this.visitExpression(child) : null,
            unused: Boolean(ctx.UNUSED())

        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitFunctionParameters(ctx: FunctionParametersContext): ast.FunctionArgument[] {
        const child = ctx.functionParameterList();
        return child ? this.visitFunctionParameterList(child) : [];
    }

    visitFunctionParameterList(ctx: FunctionParameterListContext): ast.FunctionArgument[] {
        return ctx.functionParameter().map(x => this.visitFunctionParameter(x))
    }

    visitFunctionParameter(ctx: FunctionParameterContext): ast.FunctionArgument {
        const child = ctx.expression();
        const x: FunctionArgument = {
            type: 'FunctionArgument',
            id: this.safeGetIdentifier(ctx),
            init: child ? this.visitExpression(child) : null,
            unused: Boolean(ctx.UNUSED()),
            byref: Boolean(ctx.BYREF())
        }
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitScopedMethodCall(ctx: ScopedMethodCallContext): ast.ScopedCallExpression {
        const child = ctx.methodCall();
        const x: ScopedCallExpression = {
            type: "ScopedCallExpression",
            namespace: this.safeGetIdentifier(ctx),
            call: this.visitMethodCall(child)

        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitExpression(ctx: ExpressionContext | InvalidExpressionError | TerminalNode): ast.Expression {

        if (ctx instanceof InvalidExpressionError) {
            const x: ast.InvalidExpression = {
                type: 'InvalidExpression',
                leadingComments: null,
                trailingComments: null,
                range: ctx.range
            };
            return x;
        } else if (ctx instanceof TerminalNode) {
            const x: ast.InvalidExpression = {
                type: 'InvalidExpression',
                leadingComments: null,
                trailingComments: null,
                range: tokensToRange(ctx.symbol)
            };
            return x;
        }

        let child: StructInitializerContext | MemberCallContext | ArrayInitializerContext | ScopedMethodCallContext | PrimaryContext | ExpressionListContext | MethodCallContext | undefined;
        let term: TerminalNode | undefined;
        let term2: TerminalNode | undefined;
        let token: Token | undefined;
        if ((token = ctx._bop)) {
            if (token.text === '.') {
                let object: ast.StringLiteral | ast.Identifier | ast.InvalidExpression;

                if ((child = ctx.memberCall())) {
                    try {
                        const child2 = child.expressionList();
                        const child3 = ctx.expression(0);
                        const id = child.IDENTIFIER();

                        const member: MemberExpression = {
                            type: "MemberExpression",
                            object: this.visitExpression(child3),
                            property: this.getIdentifierr(id)
                        };
                        //expressionList
                        const call: MemberCallExpression = {
                            type: "MemberCallExpression",
                            callee: this.comment(member, child3.start, id.symbol),
                            arguments: child2 ? this.visitExpressionList(child2) : []
                        };
                        return this.comment(call, ctx.start, ctx.stop);
                    } catch {
                        const x: InvalidExpression = {
                            type: 'InvalidExpression'
                        };
                        return this.comment(x, ctx.start, ctx.stop);
                    }
                } else {
                    if ((term = ctx.STRING_LITERAL())) {
                        object = this.getStringLiteral(term)
                    } else if ((term = ctx.IDENTIFIER())) {
                        object = this.getIdentifierr(term);
                    } else {
                        object = {
                            type: 'InvalidExpression',
                            leadingComments: null,
                            trailingComments: null,
                            range: tokensToRange(token)
                        };
                    }
                    const x: MemberExpression = {
                        type: "MemberExpression",
                        object: this.visitExpression(ctx.expression(0)),
                        property: object
                    };
                    return this.comment(x, ctx.start, ctx.stop);
                }
            } else {
                let right: ast.Expression;
                let term: TerminalNode | undefined;

                const expr1 = ctx.expression(1);

                if ((token.text === '.+' || token.text === '.?' || token.text === '.-') && (term = expr1?.primary()?.IDENTIFIER())) {
                    right = this.comment({
                        type: 'StringLiteral',
                        value: term.text,
                    }, term.symbol);
                } else {
                    right = this.visitExpression(ctx.expression(1));
                }
                const x: BinaryExpression = {
                    type: "BinaryExpression",
                    operator: token.text as BinaryExpression['operator'],
                    left: this.visitExpression(ctx.expression(0)),
                    right
                };
                return this.comment(x, ctx.start, ctx.stop);
            }
        } else if ((term = ctx.LBRACK()) && (term2 = ctx.RBRACK()) && (child = ctx.expressionList())) {

            const exprs = this.visitExpressionList(child);
            const y: SequenceExpression = {
                type: "SequenceExpression",
                expressions: exprs
            };

            const x: BracketExpression = {
                type: "BracketExpression",
                object: this.visitExpression(ctx.expression(0)),
                property: exprs.length === 1 ? exprs[0] : this.comment(y, term.symbol, term2.symbol)
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((child = ctx.primary())) {
            return this.visitPrimary(child);
        } else if ((child = ctx.scopedMethodCall())) {
            return this.visitScopedMethodCall(child);
        } else if ((child = ctx.methodCall())) {
            return this.visitMethodCall(child);
        } else if ((term = ctx.ARRAY())) {
            const child = ctx.arrayInitializer();
            const x: ArrayExpression = {
                type: "ArrayExpression",
                elements: child ? this.visitArrayInitializer(child) : []
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((term = ctx.RBRACE())) {
            const child = ctx.expressionList();
            const x: ArrayExpression = {
                type: "ArrayExpression",
                elements: child ? this.visitExpressionList(child) : []
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((term = ctx.DICTIONARY())) {
            const child = ctx.dictInitializer();
            const x: DictExpression = {
                type: "DictExpression",
                properties: child ? this.visitDictInitializer(child) : []
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((term = ctx.STRUCT())) {
            const child = ctx.structInitializer();

            const x: StructExpression = {
                type: "StructExpression",
                properties: child ? this.visitStructInitializer(child) : []
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((term = ctx.TOK_ERROR())) {
            const child = ctx.structInitializer();

            const x: ErrorExpression = {
                type: "ErrorExpression",
                properties: child ? this.visitStructInitializer(child) : []
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((term = ctx.AT())) {
            try {
                const x: FunctionExpression = {
                    type: "FunctionExpression",
                    id: this.getIdentifierr(term)
                };
                return this.comment(x, ctx.start, ctx.stop);
            } catch {
                const x: InvalidExpression = {
                    type: 'InvalidExpression'
                };
                return this.comment(x, ctx.start, ctx.stop);
            }
        } else if ((token = ctx._postfix)) {
            const child = ctx.expression(0);
            const x: UpdateExpression = {
                type: "UpdateExpression",
                operator: token.text as UpdateExpression['operator'],
                prefix: false,
                argument: this.visitExpression(child)
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((token = ctx._prefix)) {
            const { text } = token;
            if (text === '++' || text === '--') {
                const child = ctx.expression(0);
                const x: UpdateExpression = {
                    type: "UpdateExpression",
                    operator: token.text as UpdateExpression['operator'],
                    prefix: true,
                    argument: this.visitExpression(child)
                };
                return this.comment(x, ctx.start, ctx.stop);
            } else {
                const child = ctx.expression(0);
                const x: UnaryExpression = {
                    type: "UnaryExpression",
                    operator: token.text as UnaryExpression['operator'],
                    prefix: true,
                    argument: this.visitExpression(child)
                };
                return this.comment(x, ctx.start, ctx.stop);
            }
        }

        const x: InvalidExpression = {
            type: 'InvalidExpression'
        };
        return this.comment(x, ctx.start, ctx.stop);
        // throw new UnknownContextError(ctx);
    }

    visitPrimary(ctx: PrimaryContext): ast.Expression {
        let child: ExpressionContext | LiteralContext | undefined;
        let term: TerminalNode | undefined;
        if ((term = ctx.IDENTIFIER())) {
            return this.getIdentifierr(term);
        } else if ((child = ctx.expression())) {
            return this.visitExpression(child);
        } else if ((child = ctx.literal())) {
            return this.visitLiteral(child);
        } else {
            return this.comment({ type: 'InvalidExpression' }, ctx.start, ctx.stop);
        }
    }

    visitParExpression(ctx: ParExpressionContext): ast.Expression {
        return this.visitExpression(ctx.expression());
    }

    visitExpressionList(ctx: ExpressionListContext): ast.Expression[] {
        const exprs: ast.Expression[] = [];
        let expectExpr = true;
        if (ctx.children) {
            for (let i = ctx.children.length - 1; i >= 0; --i) {
                const child = ctx.children[i];
                if (child instanceof ExpressionContext) {
                    exprs.unshift(this.visitExpression(child));
                    expectExpr = false;
                }
                else if (child instanceof TerminalNode) {
                    if (expectExpr) {
                        exprs.unshift(this.visitExpression(child));
                    } else {
                        expectExpr = true;
                    }
                }
            }
        }
        return exprs;
        // return ctx.expression().map(expr => this.visitExpression(expr));
    }

    visitMethodCall(ctx: MethodCallContext): ast.MethodCallExpression {
        const id = ctx.IDENTIFIER();
        const child = ctx.methodCallArgumentList();
        const x: MethodCallExpression = {
            type: "MethodCallExpression",
            callee: this.getIdentifierr(id),
            arguments: child ? this.visitMethodCallArgumentList(child) : []

        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitMethodCallArgumentList(ctx: MethodCallArgumentListContext): ast.MethodCallArgument[] {
        const args: ast.MethodCallArgument[] = [];
        let expectExpr = true;
        if (ctx.children) {
            for (let i = ctx.children.length - 1; i >= 0; --i) {
                const child = ctx.children[i];
                if (child instanceof MethodCallArgumentContext) {
                    args.unshift(this.visitMethodCallArgument(child));
                    expectExpr = false;
                }
                else if (child instanceof TerminalNode) {
                    if (expectExpr) {
                        args.unshift(this.visitMethodCallArgument(child));
                    } else {
                        expectExpr = true;
                    }
                }
            }
        }
        return args;
    }

    visitMethodCallArgument(ctx: MethodCallArgumentContext | TerminalNode): ast.MethodCallArgument {
        if (ctx instanceof MethodCallArgumentContext) {
            const id = ctx.IDENTIFIER();
            const expr = safeExpression(ctx, tokensToRange(ctx.IDENTIFIER()?.symbol ?? ctx.start))

            const x: MethodCallArgument = {
                type: 'MethodCallArgument',
                argument: id ? this.getIdentifierr(id) : null,
                value: this.visitExpression(expr)
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else {
            const x: ast.MethodCallArgument = {
                type: 'MethodCallArgument',
                argument: null,
                value: {
                    type: 'InvalidExpression',
                    leadingComments: null,
                    trailingComments: null,
                    range: tokensToRange(ctx.symbol)
                },
                leadingComments: null,
                trailingComments: null,
                range: tokensToRange(ctx.symbol)
            };
            return x;
        }
    }

    visitStructInitializerExpression(ctx: StructInitializerExpressionContext): ast.StructProperty {
        let term: TerminalNode | undefined;

        let object: ast.StringLiteral | ast.Identifier | ast.InvalidExpression;
        if ((term = ctx.STRING_LITERAL())) {
            object = this.getStringLiteral(term)
        } else if ((term = ctx.IDENTIFIER())) {
            object = this.getIdentifierr(term);
        } else {
            object = this.comment({ type: 'InvalidExpression' }, ctx.start, ctx.stop);
        }

        const child = ctx.expression();
        const x: StructProperty = {
            type: "StructProperty",
            key: object,
            value: child ? this.visitExpression(child) : null
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitStructInitializerExpressionList(ctx: StructInitializerExpressionListContext): ast.StructProperty[] {
        return ctx.structInitializerExpression().map(child => this.visitStructInitializerExpression(child));
    }

    visitStructInitializer(ctx: StructInitializerContext): ast.StructProperty[] {
        const child = ctx.structInitializerExpressionList();
        return child ? this.visitStructInitializerExpressionList(child) : [];
    }

    visitDictInitializerExpression(ctx: DictInitializerExpressionContext): ast.DictProperty {
        const key = ctx.expression(0);
        const val = ctx.expression(1);
        const x: DictProperty = {
            type: "DictProperty",
            key: this.visitExpression(key),
            value: val ? this.visitExpression(val) : null
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitDictInitializerExpressionList(ctx: DictInitializerExpressionListContext): ast.DictProperty[] {
        return ctx.dictInitializerExpression().map(x => this.visitDictInitializerExpression(x));
    }

    visitDictInitializer(ctx: DictInitializerContext): ast.DictProperty[] {
        const child = ctx.dictInitializerExpressionList();
        return child ? this.visitDictInitializerExpressionList(child) : [];
    }

    visitArrayInitializer(ctx: ArrayInitializerContext): ast.Expression[] {
        const child = ctx.expressionList();
        return child ? this.visitExpressionList(child) : [];
    }

    visitLiteral(ctx: LiteralContext): ast.Literal | ast.InvalidExpression {
        let child: IntegerLiteralContext | FloatLiteralContext | undefined;
        let term: TerminalNode | undefined;
        if ((term = ctx.STRING_LITERAL())) {
            const x: StringLiteral = {
                type: 'StringLiteral',
                value: ctx.text.substring(1, ctx.text.length - 1)
            };
            return this.comment(x, ctx.start, ctx.stop);
        } else if ((child = ctx.integerLiteral())) {
            return this.visitIntegerLiteral(child)
        } else if ((child = ctx.floatLiteral())) {
            return this.visitFloatLiteral(child);
        } else {
            return this.comment({ type: 'InvalidExpression' }, ctx.start, ctx.stop);
        }
    }

    visitIntegerLiteral(ctx: IntegerLiteralContext): ast.NumericLiteral {
        const x: NumericLiteral = {
            type: 'NumericLiteral',
            value: parseInt(ctx.text)
        };
        return this.comment(x, ctx.start, ctx.stop);
    }

    visitFloatLiteral(ctx: FloatLiteralContext): ast.NumericLiteral {
        const x: NumericLiteral = {
            type: 'NumericLiteral',
            value: parseInt(ctx.text)
        };
        return this.comment(x, ctx.start, ctx.stop);
    }
}
