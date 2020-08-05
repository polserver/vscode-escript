import { ArrayExpression, BinaryExpression, BlockStatement, BreakStatement, MethodCallExpression, ContinueStatement, DoWhileStatement, EmptyStatement, ExpressionStatement, ForOfStatement, CstyleForStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, ImportDeclaration, LabeledStatement, LogicalExpression, MemberExpression, NumericLiteral, StructExpression, DictExpression, ErrorExpression, StructProperty, DictProperty, ErrorProperty, ParenthesizedExpression, Program, ReturnStatement, SequenceExpression, StringLiteral, SwitchCase, SwitchStatement, UnaryExpression, UpdateExpression, VariableDeclaration, VariableDeclarator, WhileStatement, EnumStatement, EnumEntry, ForToStatement, RepeatStatement, FunctionArgument, ProgramArgument, ModuleFunctionDeclaration, ModuleFunctionArgument, ProgramDeclaration, ScopedCallExpression, ExitStatement, AssignStatement, Statement, InvalidExpression, MemberCallExpression, MethodCallArgument, Expression, BracketExpression, InvalidStatement } from './ast-types';
import { Node, Comment, Loop } from './ast-types';
import { Scope, SymType, Sym, SymbolMapType, } from '../semantics';
import { Diagnostic, DiagnosticSeverity, Location, Range } from 'vscode-languageserver';
import { SemanticTokensBuilder } from 'vscode-languageserver/lib/semanticTokens.proposed';
import {
	SemanticTokensLegend
} from 'vscode-languageserver-protocol/lib/protocol.semanticTokens.proposed';
import * as doctrine from 'doctrine';
import { PushSourceResult, PushSourceError } from '../parser';

type Result = { scope: Scope, diagnostics: Diagnostic[]; }

type ReducerInput<T extends Node> = ((n?: Node) => Scope | void) | null | T;

export enum TokenTypes {
	COMMENT = 'comment',
	STRING = 'string',
	KEYWORD = 'keyword',
	NUMBER = 'number',
	OPERATOR = 'operator',
	NAMESPACE = 'namespace',
	TYPE = 'type',
	STRUCT = 'struct',
	CLASS = 'class',
	ENUM = 'enum',
	FUNCTION = 'function',
	MEMBER = 'member',
	VARIABLE = 'variable',
	PARAMETER = 'parameter',
	PROPERTY = 'property',
	LABEL = 'label',
	TYPEPARAMETER = 'typeParameter',
}

/** Maps a TokenTypes.X to an id used in LSP protocol  */
export const TokenTypeIds = Object.entries(TokenTypes).reduce(
	(prevValue, value, index) => ({ ...prevValue, [value[1]]: index }), {} as { [x: string]: number }
);


enum TokenModifiers {
	DECLARATION = 'declaration',
	DOCUMENTATION = 'documentation',
	READONLY = 'readonly',
	DEPRECATED = 'deprecated'
}

export const TokensLegend: SemanticTokensLegend = {
	tokenTypes: Object.values(TokenTypes),
	tokenModifiers: Object.values(TokenModifiers)
};


export type ImportResolver = (currentDeps: Set<string>, importKind: ImportDeclaration['importKind'], what: string) => Promise<PushSourceResult>;
export type TypeResolver = (type: doctrine.Type) => doctrine.Type;

export type ASTVisitorOptions = {
	importResolver?: ImportResolver,
	typeResolver?: TypeResolver
};

export type SemanticTokenResult = Parameters<typeof SemanticTokensBuilder.prototype.push>;

type Result2 = {
	tokens: SemanticTokenResult[]
	depUris: Set<string>;
	uri: string;
};

export type ASTVisitResult = Result & Result2;

type VisitOptions = {
	addStandardDeps?: boolean;
	exportsOnly?: boolean;
}

export default class ASTVisitorBase { // implements ASTVisitor<Result> {

	private stackVisit: Node[] = [];
	private currentScope: Scope[] = [];
	private semToks: SemanticTokenResult[];
	private depUris: Set<string> = new Set();
	private currentDeps: Set<string>;

	constructor(private uri: string, currentDeps: Set<string>, private opts?: ASTVisitorOptions) {
		this.depUris.add(uri);
		this.currentDeps = new Set(currentDeps);
		this.currentDeps.add(uri);
	}

	public async visit2(tree: Node, opts?: VisitOptions): Promise<ASTVisitResult | null> {
		if (this.semToks !== undefined) {
			throw new Error('Attempt visit when already visiting.');
		};
		this.semToks = [];
		const scope = this.pushScope(tree, true);
		const result = tree.type === "Program" ? await this.visitProgram(scope, tree, opts) : Promise.resolve(this.visit(scope, tree));
		this.popScope();
		const tokens = this.semToks.sort((tokInfo1, tokInfo2) => {
			const line = tokInfo1[0] - tokInfo2[0];
			if (!line)
				return tokInfo1[1] - tokInfo2[1];
			return line;
		});

		if (result) {
			return { ...await result, tokens, uri: this.uri, depUris: new Set(this.depUris) };
		}
		return null;
		// const 
		// return result;
	}

	private visit(scope: Scope, tree: Node): Result {
		const comments = [... (tree.leadingComments ?? []), ... (tree.trailingComments ?? [])]
		const diagnostics: Diagnostic[] = [];

		for (const comment of comments) {
			let parsed: doctrine.Annotation | undefined = undefined;
			try {
				const location = { uri: this.uri, range: comment.range };
				parsed = doctrine.parse(comment.value, { unwrap: true, sloppy: true, lineNumbers: true });
				if (parsed) {
					const first = parsed.tags[0] as doctrine.Tag | undefined;
					if (first && first.name) {
						const { id: name } = first.name;
						if (first.title === 'typedef') {
							/** @TODO check that first.type exists as parent type */
							const typeSym = this.resolveTypeName(name, location, parsed) ?? this.defineType(scope, new Sym(name, SymType.TYPEDEF, location, parsed), comment, diagnostics)
							if (typeSym && first.type) {
								typeSym.setAnnoType(first.type);
							}
							// console.error('create type', typeSym);
						} else if (first.title === 'method') {
							// const typeSym = this
							const index = name.indexOf('.');
							if (index > -1) {
								const parent = name.substring(0, index);
								const method = name.substring(index + 1);
								let sym: Sym | undefined = this.resolveTypeName(parent) ?? this.defineType(scope, new Sym(parent, SymType.TYPEDEF, location), comment, diagnostics);
								if (sym) {
									sym.addMethod(method, Location.create(this.uri, comment.range), parsed);
								}
							}
						}
					}
				}
			} catch (e) {
			}
		}

		const result = (() => {
			switch (tree.type) {
				case "Identifier": return this.visitIdentifier(scope, tree);
				case "ArrayExpression": return this.visitArrayExpression(scope, tree);
				case "BinaryExpression": return this.visitBinaryExpression(scope, tree);
				case "MethodCallExpression": return this.visitMethodCallExpression(scope, tree);
				case "MemberCallExpression": return this.visitMemberCallExpression(scope, tree);
				case "FunctionExpression": return this.visitFunctionExpression(scope, tree);
				case "LogicalExpression": return this.visitLogicalExpression(scope, tree);
				case "MemberExpression": return this.visitMemberExpression(scope, tree);
				case "BracketExpression": return this.visitBracketExpression(scope, tree);
				case "NumericLiteral": return this.visitNumericLiteral(scope, tree);
				case "StructExpression": return this.visitStructExpression(scope, tree);
				case "DictExpression": return this.visitDictExpression(scope, tree);
				case "ErrorExpression": return this.visitErrorExpression(scope, tree);
				case "ParenthesizedExpression": return this.visitParenthesizedExpression(scope, tree);
				case "SequenceExpression": return this.visitSequenceExpression(scope, tree);
				case "UnaryExpression": return this.visitUnaryExpression(scope, tree);
				case "UpdateExpression": return this.visitUpdateExpression(scope, tree);
				case "StringLiteral": return this.visitStringLiteral(scope, tree);
				case "ScopedCallExpression": return this.visitScopedCallExpression(scope, tree);
				case "InvalidExpression": return this.visitInvalidExpression(scope, tree);
				
				case "InvalidStatement": return this.visitInvalidStatement(scope, tree);
				case "StructProperty": return this.visitStructProperty(scope, tree);
				case "DictProperty": return this.visitDictProperty(scope, tree);
				case "ErrorProperty": return this.visitErrorProperty(scope, tree);
				case "SwitchCase": return this.visitSwitchCase(scope, tree);
				case "VariableDeclarator": return this.visitVariableDeclarator(scope, tree);
				case "EnumEntry": return this.visitEnumEntry(scope, tree);
				case "FunctionArgument": return this.visitFunctionArgument(scope, tree);
				case "ProgramArgument": return this.visitProgramArgument(scope, tree);
				case "ModuleFunctionArgument": return this.visitModuleFunctionArgument(scope, tree);
				case "MethodCallArgument": return this.visitMethodCallArgument(scope, tree);

				default:
					this.stackVisit.push(tree);
					const result = (() => {
						switch (tree.type) {
							case "AssignStatement": return this.visitAssignStatement(scope, tree);
							case "BlockStatement": return this.visitBlockStatement(scope, tree);
							case "BreakStatement": return this.visitBreakStatement(scope, tree);
							case "ContinueStatement": return this.visitContinueStatement(scope, tree);
							case "DoWhileStatement": return this.visitDoWhileStatement(scope, tree);
							case "EmptyStatement": return this.visitEmptyStatement(scope, tree);
							case "ExpressionStatement": return this.visitExpressionStatement(scope, tree);
							case "ForOfStatement": return this.visitForOfStatement(scope, tree);
							case "CstyleForStatement": return this.visitCstyleForStatement(scope, tree);
							case "FunctionDeclaration": return this.visitFunctionDeclaration(scope, tree);
							case "IfStatement": return this.visitIfStatement(scope, tree);
							case "LabeledStatement": return this.visitLabeledStatement(scope, tree);
							case "ReturnStatement": return this.visitReturnStatement(scope, tree);
							case "SwitchStatement": return this.visitSwitchStatement(scope, tree);
							case "VariableDeclaration": return this.visitVariableDeclaration(scope, tree);
							case "WhileStatement": return this.visitWhileStatement(scope, tree);
							case "EnumStatement": return this.visitEnumStatement(scope, tree);
							case "ForToStatement": return this.visitForToStatement(scope, tree);
							case "RepeatStatement": return this.visitRepeatStatement(scope, tree);
							case "ModuleFunctionDeclaration": return this.visitModuleFunctionDeclaration(scope, tree);
							case "ProgramDeclaration": return this.visitProgramDeclaration(scope, tree);
							case "ExitStatement": return this.visitExitStatement(scope, tree);
							case "ImportDeclaration": debugger; throw new Error("ImportDeclaration should use async visit");
							case "Program": debugger; throw new Error("Program should use async visit");

						}
					})();
					this.stackVisit.pop();
					return result;
			}
		})();
		diagnostics.push(...result.diagnostics);
		return { scope, diagnostics };
	}

	reducer<T extends Node>(scope: Scope, nodes: ReducerInput<T>[] | null, func: (scope: Scope, n: T) => Result) {
		// return nodes ? nodes.reduce(({scope,diagnostics}, c) => ({scope, diagnostics:[...diagnostics, ...(c ? func.call(this, scope, c) : [])]}), {scope,diagnostics:[]} as Result) : {scope, diagnostics:[]};
		type ReducerType = { lastNode: Node | null, result: Result };

		const initial: ReducerType = {
			lastNode: null,
			result: { scope, diagnostics: [] }
		};
		return nodes ? nodes.reduce(({ lastNode, result }, c) => {
			if (typeof c === 'function' && lastNode) {
				const scope: Scope = c.call(this, lastNode) || result.scope;
				return { lastNode, result: { scope, diagnostics: result.diagnostics } };
			}
			else if (typeof c !== 'function' && c) {
				const res = func.call(this, scope, c);

				return { lastNode: c, result: { scope: res.scope, diagnostics: [...result.diagnostics, ...res.diagnostics] } };
			} else {
				return { lastNode, result };
			}
		}, initial).result : initial.result;
	}

	async visitProgram(scope: Scope, ctx: Program, opts?: VisitOptions): Promise<Result | null> {
		const diagnostics: Diagnostic[] = [];
		switch (ctx.sourceType) {
			case 'script':
			case 'include':
				if (opts?.addStandardDeps ?? false) {
					await this.addStandardDeps(scope);
				}
			/* intentional fallthrough */
			case 'module':
				for (const x of ctx.body) {
					switch (x.type) {
						case 'FunctionDeclaration':
							diagnostics.push(...this.visitFunctionDeclaration(scope, x, opts?.exportsOnly ? { exportsOnly: true } : { firstPass: true }).diagnostics);
							break;
						default:
							/** 
							 * @TODO Since we won't resolve imports for exportOnly parsing, 
							 * we won't get any dependent types
							 */
							if (!opts?.exportsOnly) {
								switch (x.type) {
									case 'ImportDeclaration':
										const imported = await this.visitImportDeclaration(scope, x);
										if (!imported) {
											return null;
										}
										diagnostics.push(...imported.diagnostics);
										scope = imported.scope;
										break;
									case 'VariableDeclaration': // only constants are defined in first pass
										diagnostics.push(...this.visitVariableDeclaration(scope, x, true).diagnostics);
										break;
								}
							}
					}
				}

				diagnostics.push(...this.reducer(scope, ctx.body.filter(x => x.type !== 'ImportDeclaration'), this.visit).diagnostics);
				break;
		}
		return { scope, diagnostics };
	}

	// processExpression(scope: Scope, ctx: Expression): { result: Result, type: doctrine.Type } {
	// 	const ALL: doctrine.type.AllLiteral = {
	// 		type: 'AllLiteral',
	// 	};

	// 	switch (ctx.type) {
	// 		case 'NumericLiteral': {
	// 			const result = this.visitNumericLiteral(scope, ctx);
	// 			const type: doctrine.type.NumericLiteralType = {
	// 				type: 'NumericLiteralType',
	// 				value: ctx.value
	// 			};

	// 			return { type, result };
	// 		}
	// 		case 'MethodCallExpression': {
	// 			const result = this.visitMethodCallExpression(scope, ctx);
	// 			const type = this.resolve(ctx.callee)?.getAnnotation()?.tags.find(tag => tag.title === 'returns')?.type ?? ALL;
	// 			return { type, result };
	// 		}
	// 	}

	// 	const result = this.visit(scope, ctx);
	// 	return { type: ALL, result };
	// }

	visitExpressionStatement(scope: Scope, ctx: ExpressionStatement): Result {
		const diagnostics: Diagnostic[] = [];
		if (!ctx.terminated) {
			diagnostics.push(this.createDiagnostic(ctx, `Missing ';' terminator.`));
		}
		diagnostics.push(...this.visit(scope, ctx.expression).diagnostics);
		return { scope, diagnostics };
	}

	defaultResult(scope: Scope): Result {
		return { scope, diagnostics: [] };
	}

	viewJumpTarget(scope: Scope, ctx: BreakStatement | ContinueStatement): Result {
		const target = ctx.label?.name;
		let current: Node | undefined, index = this.stackVisit.length;
		while ((current = this.stackVisit[--index])) {
			// if (current.type === 'BlockStatement') {
			// 	for (const child of current.body) {
			// 		if (child.type === "LabeledStatement" && (!target || child.label.name === target)) {
			// 			return [];
			// 		}
			// 	}
			// }
			// if (current.type === 'WhileStatement')
			if (target === undefined) {
				if (current.type === 'SwitchStatement' || Loop.is(current)) {
					return this.defaultResult(scope);
				}
			} else if (current.type === "LabeledStatement" && current.label.name === target) {
				return this.defaultResult(scope);;
			}
		}
		return { scope, diagnostics: [this.createDiagnostic(ctx, `No valid break target`)] };
	}


	createDiagnostic(rangable: { range: Range }, message: string, severity?: DiagnosticSeverity): Diagnostic {
		return Diagnostic.create(rangable.range, message, severity);
	}

	getType(scope: Scope, expr: Expression): doctrine.Type {
		const defaultType = {
			type: "AllLiteral"
		} as doctrine.Type;

		switch (expr.type) {
			case "Identifier": {
				const sym = this.resolve(expr);
				const annotation = sym?.getAnnotation();
				if (annotation) {
					return annotation.tags.reduce((p, c) => c.type ? c.type : p, defaultType);
				}
			}
		}

		return defaultType;
	}


	visitInvalidExpression(scope: Scope, ctx: InvalidExpression): Result {
		const diagnostics: Diagnostic[] = [];
		diagnostics.push(this.createDiagnostic(ctx, 'Missing expression.'));
		return { scope, diagnostics };
	}

	visitInvalidStatement(scope: Scope, ctx: InvalidStatement): Result {
		const diagnostics: Diagnostic[] = [];
		diagnostics.push(this.createDiagnostic(ctx, 'Invalid statement.'));
		return { scope, diagnostics };
	}

	visitMethodCallExpression(scope: Scope, ctx: MethodCallExpression): Result {
		const diagnostics: Diagnostic[] = [];
		const { symbol, diagnostics: childDiagnostics } = this.visitIdentifier(scope, ctx.callee);;
		diagnostics.push(...childDiagnostics);
		if (symbol) {
			const { args } = symbol;
			const symType = symbol.getType();
			if (!symbol.isCallable()) {
				diagnostics.push(this.createDiagnostic(ctx.callee, `Expected callable function, got ${symbol.getTypeName()}`));
			} else if (args) {
				const required = args.reduce((p, c) => Object.assign({ ...p }, { [c.symbol.getName()]: c.required ? [true,0] : [false,0] }), {} as { [name: string]: [boolean,number] });
				const callArgs = ctx.arguments.map(x => this.visitMethodCallArgument(scope, x));
				for (let i = 0; i < callArgs.length; ++i) {
					const callArg = callArgs[i];
					if (callArg.argument) {
						const name = callArg.argument.name;
						const found = args.find(x => x.symbol.getName() === name.toLowerCase());
						if (found) {
							const symName = found.symbol.getName();
							this.semToks.push([callArg.argument.range.start.line, callArg.argument.range.start.character, name.length, TokenTypeIds[TokenTypes.PARAMETER], 0]);
							if (symName in required) {
								const passedCount = ++required[symName][1];
								if (passedCount > 1) {
									diagnostics.push(this.createDiagnostic(callArg.argument, `Parameter '${name}' passed more than once to '${symbol.getCasedName()}'.`));
								}
							}
						} else {
							diagnostics.push(this.createDiagnostic(callArg.argument, `Parameter '${name}' passed by name to '${symbol.getCasedName()}', which takes no such parameter.`));
						}
					} else {
						const arg = args[i];
						if (!arg) {
							diagnostics.push(this.createDiagnostic(ctx, `Too many parameters passed to function call.`));
						} else {
							const symName = arg.symbol.getName();
							if (symName in required) {
								const passedCount = ++required[symName][1];
								if (passedCount > 1) {
									diagnostics.push(this.createDiagnostic(callArg.expression, `Parameter '${symName}' passed more than once to '${symbol.getCasedName()}'.`));
								}
							}
						}
					}
				}
				const missing = Object.entries(required).reduce((p,[name, [required, passCount]]) => !required ? p : passCount > 0 ? p : p.concat(name), [] as string[]);

				if (missing.length) {
					const s = missing.length > 1 ? 's' : '';
					diagnostics.push(this.createDiagnostic(ctx, `Missing argument${s}, and there ${s ? 'are' : 'is'} no default${s}: ${missing.join(', ')}.`));
				}
			}
		}
		diagnostics.push(...this.reducer(scope, ctx.arguments, this.visit).diagnostics)

		return { scope, diagnostics };
	}

	visitMemberCallExpression(scope: Scope, ctx: MemberCallExpression): Result {
		const diagnostics: Diagnostic[] = [];
		const { diagnostics: childDiagnostics } = this.visitMemberExpression(scope, ctx.callee, true);
		diagnostics.push(...childDiagnostics);
		diagnostics.push(...this.reducer(scope, ctx.arguments, this.visit).diagnostics)
		return { scope, diagnostics };
	}

	visitMethodCallArgument(scope: Scope, ctx: MethodCallArgument): Result & { expression: Expression, argument: Identifier | null } {
		return { ...this.visit(scope, ctx.value), expression: ctx.value, argument: ctx.argument };
	}


	visitArrayExpression(scope: Scope, ctx: ArrayExpression): Result {
		return this.reducer(scope, ctx.elements, this.visit);
	}

	visitBinaryExpression(scope: Scope, ctx: BinaryExpression): Result {
		return this.reducer(scope, [ctx.left, ctx.right], this.visit);
	}

	visitBlockStatement(scope: Scope, ctx: BlockStatement, newScope = true): Result {
		const diagnostics: Diagnostic[] = [];
		let childScope = scope;
		if (newScope) {
			childScope = this.pushScope(ctx);
		}
		diagnostics.push(...this.reducer(childScope, ctx.body, this.visit).diagnostics);
		if (newScope) {
			this.popScope();
		}
		return { scope, diagnostics };
	}

	visitBreakStatement(scope: Scope, ctx: BreakStatement): Result {
		return this.viewJumpTarget(scope, ctx);
	}

	visitLabeledStatement(scope: Scope, ctx: LabeledStatement): Result {
		const { body } = ctx;
		const allowed = ["ForOfStatement",
			"CstyleForStatement",
			"DoWhileStatement",
			"ForToStatement",
			"WhileStatement"];

		const diagnostics: Diagnostic[] = (allowed.indexOf(body.type) > -1) ? [] : [this.createDiagnostic(ctx, 'Labels are only allowed in loop statements')];
		this.define(scope, ctx.label, SymType.LABEL, diagnostics);
		this.semToks.push([ctx.label.range.start.line, ctx.label.range.start.character, ctx.label.name.length, TokenTypeIds[TokenTypes.LABEL], 0]);
		diagnostics.push(...this.visit(scope, ctx.body).diagnostics);
		return { scope, diagnostics };
	}

	visitContinueStatement(scope: Scope, ctx: ContinueStatement): Result {
		return this.viewJumpTarget(scope, ctx);
	}

	visitDoWhileStatement(scope: Scope, ctx: DoWhileStatement): Result {
		return this.reducer(scope, [ctx.test, ctx.body], this.visit);
	}

	visitEmptyStatement(scope: Scope, ctx: EmptyStatement): Result { return this.defaultResult(scope); }

	visitForOfStatement(scope: Scope, ctx: ForOfStatement): Result {
		const diagnostics: Diagnostic[] = [];
		const childScope = this.pushScope(ctx);

		this.define(childScope, ctx.left, SymType.VARIABLE, diagnostics);
		this.define(childScope, ctx.left, SymType.VARIABLE, diagnostics, `_${ctx.left.name}_iter`);
		diagnostics.push(...this.reducer(childScope, [ctx.left, ctx.right], this.visit).diagnostics);
		diagnostics.push(...this.visitBlockStatement(childScope, ctx.body, false).diagnostics)
		this.popScope();
		return { scope, diagnostics };
	}

	visitCstyleForStatement(scope: Scope, ctx: CstyleForStatement): Result {
		return this.reducer(scope, [ctx.init, ctx.test, ctx.update, ctx.body], this.visit);
	}

	visitAssignStatement(scope: Scope, ctx: AssignStatement): Result {
		return this.reducer(scope, [ctx.left, ctx.right], this.visit);
	}

	visitFunctionDeclaration(scope: Scope, ctx: FunctionDeclaration, opts?: { firstPass?: boolean, exportsOnly?: boolean }): Result {
		const diagnostics: Diagnostic[] = [];

		if (opts?.firstPass || opts?.exportsOnly) {
			const result = this.visitFunctionLikeDeclaration(scope, ctx, !opts?.exportsOnly);
			return result;
		} else {
			if (ctx.body) {
				const childScope = this.restoreScope(ctx);
				if (childScope) {
					// debugger;
					// diagnostics.push(this.createDiagnostic(ctx,))
					diagnostics.push(...this.visitBlockStatement(childScope, ctx.body, false).diagnostics)
					this.popScope();
				} else {
					throw new Error(`Could not find stored function scope for ${ctx.id}`);
				}
			}
		}

		return { scope, diagnostics };
	}

	visitIdentifier(scope: Scope, ctx: Identifier): Result & { symbol: Sym | undefined } {
		const diagnostics: Diagnostic[] = [];
		const { name } = ctx;
		// const text = token.text;
		let type: TokenTypes | null = null;

		const symbol = this.resolve(ctx);

		if (!symbol) {
			diagnostics.push(this.createDiagnostic(ctx, `Identifier ${name} not found.`));
			ctx.annoType = {
				type: 'AllLiteral'
			};
		} else {
			// @TODO handle labels...
			switch (symbol.getType()) {
				case SymType.NAMESPACE:
					type = TokenTypes.NAMESPACE;
					break;
				case SymType.FUNCTION:
				case SymType.MODULE_FUNCTION:
				case SymType.PROGRAM:
					type = TokenTypes.FUNCTION;
					break;
				default:
					type = TokenTypes.VARIABLE;
			}

			// const range = tokensToRange(ctx);
			this.semToks.push([ctx.range.start.line, ctx.range.start.character, name.length, TokenTypeIds[type], 0]);
			// [token.line - 1, token.charPositionInLine, token.stopIndex - token.startIndex + 1, TokenTypeIds[type], 0]
			const annoType = symbol.getAnnoType();
			if (annoType) {
				ctx.annoType = annoType;
			}
		}
		return { scope, diagnostics, symbol };
	}

	visitFunctionExpression(scope: Scope, ctx: FunctionExpression): Result {
		const { diagnostics, symbol } = this.visitIdentifier(scope, ctx.id);

		if (symbol && symbol.getType() !== SymType.FUNCTION) {
			diagnostics.push(this.createDiagnostic(ctx, `Expecting user function for function reference, got ${symbol.getTypeName()}.`));
		}
		ctx.annoType = {
			type: 'FunctionObjectLiteral'
		};
		return { scope, diagnostics };
	}

	visitIfStatement(scope: Scope, ctx: IfStatement): Result {
		return this.reducer(scope, [ctx.test, ctx.consequent, ctx.alternate], this.visit);
	}

	private async addStandardDeps(scope: Scope) {
		const res = await Promise.all([
			this.resolveDependency(scope, 'module', 'basic'),
			this.resolveDependency(scope, 'module', 'basicio')
		]);
		return res.filter(x => x.reason === 'error');
	}

	private async resolveDependency(scope: Scope, importKind: ImportDeclaration['importKind'], what: string): Promise<{ reason: PushSourceResult['reason'] ,  details?: string}> {
		if (this.opts?.importResolver) {
			const resolved = await this.opts.importResolver(this.currentDeps, importKind, what);

			 if (resolved.reason === 'success') {
				const { astVisit } = resolved;

				if (!this.depUris.has(astVisit.uri)) {
					astVisit.scope.symbols.forEach((sym) => {
						scope.define(sym.clone());
					});
					astVisit.scope.types.forEach((sym) => {
						scope.define(sym.clone());
					});
					astVisit.depUris.forEach(x => (this.depUris.add(x), this.currentDeps.add(x)));
				}
				return { reason: 'success' };
			} else {
				return { ...resolved }
			}
		}
		return { reason: 'error', details: `No import resolver set to resolve ${what}` };
	}
	/** @TODO oh yeah... */
	async visitImportDeclaration(scope: Scope, ctx: ImportDeclaration): Promise<Result | null> {
		const diagnostics: Diagnostic[] = [];

		if (ctx.source.type === 'InvalidExpression') {
			diagnostics.push(...this.visitInvalidExpression(scope, ctx.source).diagnostics);
		} else {
			const what = ctx.source.type === 'Identifier' ? ctx.source.name : ctx.source.value;

			const imported = await this.resolveDependency(scope, ctx.importKind, what); // await this.importResolver?.(this.uri, ctx.importKind, what);
			if (imported.reason === 'error') {
				diagnostics.push(this.createDiagnostic(ctx, `Could not load ${ctx.importKind} ${what}: ${imported.details}.`));
			} else if (imported.reason === 'cancel' || imported.reason === 'reparse') {
				return null;
			}
		}
		return { scope, diagnostics };
	}


	visitNumericLiteral(scope: Scope, ctx: NumericLiteral): Result {
		ctx.annoType = {
			type: 'NumericLiteralType',
			value: ctx.value
		};
		return this.defaultResult(scope);
	}

	visitLogicalExpression(scope: Scope, ctx: LogicalExpression): Result {
		return this.reducer(scope, [ctx.left, ctx.right], this.visit);
	}

	visitMemberExpression(scope: Scope, ctx: MemberExpression, insideMemberCall = false): Result {
		const diagnostics: Diagnostic[] = [];
		let annoType: doctrine.Type = { type: 'AllLiteral' };

		// const prop = Scope.findTypeProperty(this.currentScope, annoType2.name, astNode.name);

		diagnostics.push(...this.visit(scope, ctx.object).diagnostics);
		// ctx.object.annoType


		if (ctx.property.type === 'Identifier') {
			this.semToks.push([ctx.property.range.start.line, ctx.property.range.start.character, ctx.property.name.length, TokenTypeIds[insideMemberCall ? TokenTypes.FUNCTION : TokenTypes.PROPERTY], 0]);
		} else {
			diagnostics.push(...this.visit(scope, ctx.property).diagnostics);
		}

		const propName = ctx.property.type === 'Identifier' ? ctx.property.name : ctx.property.type === 'StringLiteral' ? ctx.property.value : undefined;

		if (propName) {
			const prop = Scope.findTypeProperty(this.currentScope, ctx.object.annoType, propName);
			if (prop?.type === 'member' && prop.tag.type) {
				annoType = prop.tag.type;
			}
		}
		ctx.annoType = annoType;

		return { scope, diagnostics };
	}

	visitBracketExpression(scope: Scope, ctx: BracketExpression): Result {
		return this.reducer(scope, [ctx.object, ctx.property], this.visit);
	}

	visitStructExpression(scope: Scope, ctx: StructExpression): Result {
		return this.reducer(scope, ctx.properties, this.visitStructProperty);
	}

	visitStructProperty(scope: Scope, ctx: StructProperty): Result {
		return this.reducer(scope, [ctx.key, ctx.value], this.visit);
	}

	visitDictExpression(scope: Scope, ctx: DictExpression): Result {
		return this.reducer(scope, ctx.properties, this.visitDictProperty);
	}

	visitDictProperty(scope: Scope, ctx: DictProperty): Result {
		return this.reducer(scope, [ctx.key, ctx.value], this.visit);
	}


	visitErrorExpression(scope: Scope, ctx: ErrorExpression): Result {
		return this.reducer(scope, ctx.properties, this.visitErrorProperty);
	}

	visitErrorProperty(scope: Scope, ctx: ErrorProperty | StructProperty): Result {
		return this.reducer(scope, [ctx.key, ctx.value], this.visit);
	}

	visitParenthesizedExpression(scope: Scope, ctx: ParenthesizedExpression): Result {
		return this.visit(scope, ctx.expression);
	}

	visitReturnStatement(scope: Scope, ctx: ReturnStatement): Result {
		return ctx.argument ? this.visit(scope, ctx.argument) : this.defaultResult(scope);
	}

	visitSequenceExpression(scope: Scope, ctx: SequenceExpression): Result {
		return this.reducer(scope, ctx.expressions, this.visit);
	}

	visitStringLiteral(scope: Scope, ctx: StringLiteral): Result { return this.defaultResult(scope); }

	/** @TODO fix cases */
	visitSwitchCase(scope: Scope, ctx: SwitchCase): Result {
		const diagnostics: Diagnostic[] = [];
		if (ctx.test) {
			diagnostics.push(...this.visit(scope, ctx.test).diagnostics);
		}
		diagnostics.push(...this.reducer(scope, ctx.consequent, this.visit).diagnostics);
		return { scope, diagnostics };
	}

	visitSwitchStatement(scope: Scope, ctx: SwitchStatement): Result {
		const cases: (SwitchCase | InvalidStatement)[] = [];
		for (const caze of ctx.cases) {
			if (caze.type === 'InvalidStatement') {
				cases.push(caze);
				continue;
			}
			if (!caze.consequent.length) {
				cases.push(caze);
				continue;
			}

			let newCase: SwitchCase = {
				type: 'SwitchCase',
				test: caze.test,
				consequent: [],
				leadingComments: caze.leadingComments,
				range: caze.range,
				trailingComments: caze.trailingComments,
			}
			cases.push(newCase);

			for (let stmt of caze.consequent) {
				while (stmt.type === 'LabeledStatement') {
					const sym = this.resolve(stmt.label);
					const isConstant = Boolean(sym?.getType() === SymType.CONSTANT || sym?.getType() === SymType.ENUM_CONSTANT);
					const isLoopLabel = Loop.is(stmt.body);
					if (isConstant || !isLoopLabel) {
						newCase = {
							type: 'SwitchCase',
							test: stmt.label,
							consequent: [],
							leadingComments: stmt.leadingComments,
							range: //stmt.range,
							{
								start: stmt.range.start,
								end: {
									line: stmt.range.start.line,
									character: stmt.range.start.character + stmt.label.name.length + 1
								}
							},
							trailingComments: stmt.trailingComments,
						};
						cases.push(newCase);
						stmt = stmt.body;
					} else {
						break;
					}
				}
				newCase.range.end = { ...stmt.range.end };
				newCase.consequent.push(stmt);
			}
		}
		ctx.cases = cases;
		return this.reducer(scope, [ctx.discriminant, ...cases], this.visit);
	}

	visitUnaryExpression(scope: Scope, ctx: UnaryExpression): Result {
		return this.visit(scope, ctx.argument);
	}

	visitUpdateExpression(scope: Scope, ctx: UpdateExpression): Result {
		return this.visit(scope, ctx.argument);
	}

	visitVariableDeclaration(scope: Scope, ctx: VariableDeclaration, isFirstPass = false): Result {
		const diagnostics: Diagnostic[] = [];
		if (ctx.kind === 'const' && isFirstPass) {
			for (const decl of ctx.declarations) {
				diagnostics.push(...this.visitVariableDeclarator(scope, decl, SymType.CONSTANT, ctx.leadingComments).diagnostics);
			}
		}
		else if (ctx.kind === 'var' && !isFirstPass) {
			for (const decl of ctx.declarations) {
				diagnostics.push(...this.visitVariableDeclarator(scope, decl, SymType.VARIABLE, ctx.leadingComments).diagnostics);
			}
		}
		return { scope, diagnostics };
	}

	private defineType(scope: Scope, sym: Sym, node: Comment, diagnostics: Diagnostic[]) {
		try {
			return scope.define(sym);
		} catch (e) {
			diagnostics.push(this.createDiagnostic(node, e.toString()));
		}
	}

	private define(scope: Scope, id: Identifier, type: SymType, diagnostics: Diagnostic[]): Sym | undefined;
	private define(scope: Scope, id: Identifier, type: SymType, diagnostics: Diagnostic[], comments: (ReadonlyArray<Comment> | null), range?: Range): Sym | undefined;
	private define(scope: Scope, id: Identifier, type: SymType, diagnostics: Diagnostic[], name: string): Sym | undefined;

	private define(scope: Scope, id: Identifier, type: SymType, diagnostics: Diagnostic[], nameOrComments?: string | (ReadonlyArray<Comment> | null), range?: Range) {
		const name = typeof nameOrComments === 'string' ? nameOrComments : id.name;
		const leadingComments = (nameOrComments === undefined || id.leadingComments) ? id.leadingComments : typeof nameOrComments !== 'string' ? nameOrComments : null;

		const location = range ? { uri: this.uri, range } : this.nodeToLoc(id);

		let annotation: doctrine.Annotation | undefined = undefined;
		const comment = leadingComments?.[leadingComments.length - 1];
		if (comment) {
			try {
				annotation = doctrine.parse(comment.value, { unwrap: true });
				if (annotation && this.opts?.typeResolver) {
					for (const tag of annotation.tags) {
						if (tag.type) {
							tag.type = this.opts.typeResolver(tag.type);
						}
					}
				}
			} catch { /* Ignore doc parsing error */ }
		}

		try {
			const sym = new Sym(name, type, location, annotation);
			scope.define(sym);
			return sym;
		} catch (e) {
			diagnostics.push(this.createDiagnostic(id, e.toString()));
		}
	}

	visitVariableDeclarator(scope: Scope, ctx: VariableDeclarator, type: SymType = SymType.VARIABLE, leadingComments: ReadonlyArray<Comment> | null = null): Result {
		const diagnostics: Diagnostic[] = [];
		const sym = this.define(scope, ctx.id, type, diagnostics, leadingComments);

		diagnostics.push(...this.visitIdentifier(scope, ctx.id).diagnostics);

		if (ctx.init) {

			const expr = { result: this.visit(scope, ctx.init) }; // this.processExpression(scope, ctx.init);
			diagnostics.push(...expr.result.diagnostics);

			if (sym && !sym.getAnnoType() && ctx.init.annoType) {
				sym.setAnnoType(ctx.init.annoType);
			}
		}

		return { scope, diagnostics };
	}

	visitWhileStatement(scope: Scope, ctx: WhileStatement): Result {
		return this.reducer(scope, [ctx.test, ctx.body], this.visit);
	}

	/** @TODO fix enums */
	visitEnumStatement(scope: Scope, ctx: EnumStatement): Result {
		return this.reducer(scope, ctx.decls, this.visitEnumEntry);
	}
	visitEnumEntry(scope: Scope, ctx: EnumEntry): Result {
		const diagnostics: Diagnostic[] = [];
		this.define(scope, ctx.id, SymType.ENUM_CONSTANT, diagnostics);
		diagnostics.push(...this.visitIdentifier(scope, ctx.id).diagnostics);
		if (ctx.value) {
			diagnostics.push(...this.visit(scope, ctx.value).diagnostics);
		}
		return { scope, diagnostics };
	}

	visitForToStatement(scope: Scope, ctx: ForToStatement): Result {
		const diagnostics: Diagnostic[] = [];
		const childScope = this.pushScope(ctx);
		this.define(scope, ctx.id, SymType.VARIABLE, diagnostics);

		diagnostics.push(...this.reducer(childScope, [ctx.id, ctx.from, ctx.to], this.visit).diagnostics);
		diagnostics.push(...this.visitBlockStatement(childScope, ctx.body, false).diagnostics);
		this.popScope();
		return { scope, diagnostics };
	}

	visitRepeatStatement(scope: Scope, ctx: RepeatStatement): Result {
		return this.reducer(scope, [ctx.test, ctx.body], this.visit);
	}

	visitModuleFunctionDeclaration(scope: Scope, ctx: ModuleFunctionDeclaration): Result {
		return this.visitFunctionLikeDeclaration(scope, ctx);
	}

	visitFunctionArgument(scope: Scope, ctx: FunctionArgument, argType?: doctrine.Type | null): Result & { symbol: Sym | undefined } {
		const diagnostics: Diagnostic[] = [];
		const symbol = this.define(scope, ctx.id, SymType.FUNCTION_ARGUMENT, diagnostics);
		if (symbol && argType && !symbol.getAnnoType()) {
			symbol.setAnnoType(argType);
		}
		diagnostics.push(...this.reducer(scope, [ctx.id, ctx.init], this.visit).diagnostics);
		return { scope, diagnostics, symbol };
	}

	visitProgramArgument(scope: Scope, ctx: ProgramArgument, argType?: doctrine.Type | null): Result & { symbol: Sym | undefined } {
		const diagnostics: Diagnostic[] = [];
		const symbol = this.define(scope, ctx.id, SymType.PROGRAM_ARGUMENT, diagnostics);
		if (symbol && argType && !symbol.getAnnoType()) {
			symbol.setAnnoType(argType);
		}
		diagnostics.push(...this.reducer(scope, [ctx.id, ctx.init], this.visit).diagnostics);
		return { scope, diagnostics, symbol };
	}

	visitModuleFunctionArgument(scope: Scope, ctx: ModuleFunctionArgument, argType?: doctrine.Type | null): Result & { symbol: Sym | undefined } {
		const diagnostics: Diagnostic[] = [];
		const symbol = this.define(scope, ctx.id, SymType.FUNCTION_ARGUMENT, diagnostics);
		if (symbol && argType && !symbol.getAnnoType()) {
			symbol.setAnnoType(argType);
		}
		diagnostics.push(...this.reducer(scope, [ctx.id, ctx.init], this.visit).diagnostics);
		return { scope, diagnostics, symbol };
	}

	private nodeToLoc(ctx: Node): Location {
		return {
			uri: this.uri,
			range: ctx.range
		}
	}

	appendScope(scope: Scope) {
		this.currentScope.push(scope);
	}

	pushScope(ctx: Node, initial = false): Scope {
		const loc: Location = initial ? {
			uri: this.uri,
			range: {
				start: {
					line: 1,
					character: 1
				},
				end: {
					line: Number.MAX_SAFE_INTEGER,
					character: Number.MAX_SAFE_INTEGER
				}
			}
		} : this.nodeToLoc(ctx);
		const childScope = new Scope(loc, this.currentScope[this.currentScope.length - 1]);
		this.currentScope.push(childScope);
		return childScope;
	}

	private storedScopes: WeakMap<FunctionDeclaration, Scope> = new WeakMap();

	storeScope(ctx: FunctionDeclaration, scope: Scope) {
		this.storedScopes.set(ctx, scope);
		this.currentScope.pop();
	}
	popScope() {
		this.currentScope.pop();
	}
	restoreScope(ctx: FunctionDeclaration) {
		const scope = this.storedScopes.get(ctx);
		if (scope) {
			this.currentScope.push(scope);
			this.storedScopes.delete(ctx);
		}
		return scope;
	}

	resolveTypeName(name: string, location?: Location, parsed?: doctrine.Annotation) {
		for (let i = this.currentScope.length - 1; i >= 0; --i) {
			const sym = this.currentScope[i].resolve(name, SymbolMapType.TYPES);
			if (sym) {
				if (location && parsed) {
					sym.updateAnnotation(location, parsed);
				}
				return sym;
			}
		}
	}

	resolve(id: Identifier) {
		for (let i = this.currentScope.length - 1; i >= 0; --i) {
			const sym = this.currentScope[i].resolve(id.name);
			if (sym) {
				return sym;
			}
		}
	}

	visitFunctionLikeDeclaration(scope: Scope, ctx: FunctionDeclaration | ProgramDeclaration | ModuleFunctionDeclaration, storeScope = false): Result {
		const diagnostics: Diagnostic[] = [];

		const type = ctx.type === 'FunctionDeclaration' ? (ctx.exported ? SymType.EXPORTED_FUNCTION : SymType.FUNCTION) : ctx.type === 'ProgramDeclaration' ? SymType.PROGRAM : SymType.MODULE_FUNCTION;
		const func = this.define(scope, ctx.id, type, diagnostics, ctx.leadingComments, ctx.range);
		diagnostics.push(...this.visitIdentifier(scope, ctx.id).diagnostics);


		const childScope = this.pushScope(ctx);
		for (const p of ctx.params) {
			const argType = func?.getParamTag(p.id.name)?.type;
			const { symbol, diagnostics: childDiagnostics } = p.type === 'FunctionArgument' ? this.visitFunctionArgument(childScope, p, argType) : p.type === 'ProgramArgument' ? this.visitProgramArgument(childScope, p, argType) : this.visitModuleFunctionArgument(childScope, p, argType);
			diagnostics.push(...childDiagnostics);
			if (func && symbol) {
				func.addArg(symbol, !p.init);
			}
		}

		if (ctx.type === 'ProgramDeclaration') {
			diagnostics.push(...this.visitBlockStatement(childScope, ctx.body, false).diagnostics);
		}

		if (storeScope && ctx.type === 'FunctionDeclaration') {
			this.storeScope(ctx, childScope);
		} else {
			this.popScope();
		}
		return { scope, diagnostics };
	}

	visitProgramDeclaration(scope: Scope, ctx: ProgramDeclaration): Result {
		return this.visitFunctionLikeDeclaration(scope, ctx);
	}

	visitScopedCallExpression(scope: Scope, ctx: ScopedCallExpression): Result {
		const { diagnostics } = this.visitIdentifier(scope, ctx.namespace);
		/** @TODO fix this check */
		// if (symbol && symbol.getType() !== SymType.NAMESPACE) {
		// 	result.push(this.createDiagnostic(ctx.start, ctx.end, `Expected module for scoped expression call, got ${symbol.getTypeName()}`));
		// }
		return { scope, diagnostics };
	}

	visitExitStatement(scope: Scope, ctx: ExitStatement): Result { return this.defaultResult(scope); }
}

// interface ASTVisitor<T> {
// 	visitAssignStatement?(scope: Scope, ctx: AssignStatement): T;
// 	visitArrayExpression?(scope: Scope, ctx: ArrayExpression): T;
// 	visitBinaryExpression?(scope: Scope, ctx: BinaryExpression): T;
// 	visitBlockStatement?(scope: Scope, ctx: BlockStatement): T;
// 	visitBreakStatement?(scope: Scope, ctx: BreakStatement): T;
// 	visitMemberCallExpression?(scope: Scope, ctx: MemberCallExpression): T;
// 	visitMethodCallExpression?(scope: Scope, ctx: MethodCallExpression): T;
// 	visitMethodCallArgument?(scope: Scope, ctx: MethodCallArgument): T;
// 	visitContinueStatement?(scope: Scope, ctx: ContinueStatement): T;
// 	visitDoWhileStatement?(scope: Scope, ctx: DoWhileStatement): T;
// 	visitEmptyStatement?(scope: Scope, ctx: EmptyStatement): T;
// 	visitExpressionStatement?(scope: Scope, ctx: ExpressionStatement): T;
// 	visitForOfStatement?(scope: Scope, ctx: ForOfStatement): T;
// 	visitCstyleForStatement?(scope: Scope, ctx: CstyleForStatement): T;
// 	visitFunctionDeclaration?(scope: Scope, ctx: FunctionDeclaration): T;
// 	visitFunctionExpression?(scope: Scope, ctx: FunctionExpression): T;
// 	visitIdentifier?(scope: Scope, ctx: Identifier): T;
// 	visitIfStatement?(scope: Scope, ctx: IfStatement): T;
// 	visitImportDeclaration?(scope: Scope, ctx: ImportDeclaration): Promise<T>;
// 	visitInvalidExpression?(scope: Scope, ctx: InvalidExpression): T;
// 	visitLabeledStatement?(scope: Scope, ctx: LabeledStatement): T;
// 	visitLogicalExpression?(scope: Scope, ctx: LogicalExpression): T;
// 	visitMemberExpression?(scope: Scope, ctx: MemberExpression): T;
// 	visitNumericLiteral?(scope: Scope, ctx: NumericLiteral): T;
// 	visitStructExpression?(scope: Scope, ctx: StructExpression): T;
// 	visitDictExpression?(scope: Scope, ctx: DictExpression): T;
// 	visitErrorExpression?(scope: Scope, ctx: ErrorExpression): T;
// 	visitStructProperty?(scope: Scope, ctx: StructProperty): T;
// 	visitDictProperty?(scope: Scope, ctx: DictProperty): T;
// 	visitErrorProperty?(scope: Scope, ctx: ErrorProperty): T;
// 	visitParenthesizedExpression?(scope: Scope, ctx: ParenthesizedExpression): T;
// 	visitProgram?(scope: Scope, ctx: Program): Promise<T>;
// 	visitReturnStatement?(scope: Scope, ctx: ReturnStatement): T;
// 	visitSequenceExpression?(scope: Scope, ctx: SequenceExpression): T;
// 	visitStringLiteral?(scope: Scope, ctx: StringLiteral): T;
// 	visitSwitchCase?(scope: Scope, ctx: SwitchCase): T;
// 	visitSwitchStatement?(scope: Scope, ctx: SwitchStatement): T;
// 	visitUnaryExpression?(scope: Scope, ctx: UnaryExpression): T;
// 	visitUpdateExpression?(scope: Scope, ctx: UpdateExpression): T;
// 	visitVariableDeclaration?(scope: Scope, ctx: VariableDeclaration): T;
// 	visitVariableDeclarator?(scope: Scope, ctx: VariableDeclarator): T;
// 	visitWhileStatement?(scope: Scope, ctx: WhileStatement): T;
// 	visitEnumStatement?(scope: Scope, ctx: EnumStatement): T;
// 	visitEnumEntry?(scope: Scope, ctx: EnumEntry): T;
// 	visitForToStatement?(scope: Scope, ctx: ForToStatement): T;
// 	visitRepeatStatement?(scope: Scope, ctx: RepeatStatement): T;
// 	visitFunctionArgument?(scope: Scope, ctx: FunctionArgument): T;
// 	visitProgramArgument?(scope: Scope, ctx: ProgramArgument): T;
// 	visitModuleFunctionDeclaration?(scope: Scope, ctx: ModuleFunctionDeclaration): T;
// 	visitModuleFunctionArgument?(scope: Scope, ctx: ModuleFunctionArgument): T;
// 	visitProgramDeclaration?(scope: Scope, ctx: ProgramDeclaration): T;
// 	visitScopedCallExpression?(scope: Scope, ctx: ScopedCallExpression): T;
// 	visitExitStatement?(scope: Scope, ctx: ExitStatement): T;
// }
