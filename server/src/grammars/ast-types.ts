import type { Range, Position } from 'vscode-languageserver';
import { containsPosition } from '../utils';
import type { Type } from 'doctrine';

interface BaseComment {
	value: string;
	range: Range;
	type: "CommentBlock" | "CommentLine";
}

export interface CommentBlock extends BaseComment {
	type: "CommentBlock";
}

export interface CommentLine extends BaseComment {
	type: "CommentLine";
}

export type Comment = CommentBlock | CommentLine;

interface BaseNode {
	leadingComments: ReadonlyArray<Comment> | null;
	trailingComments: ReadonlyArray<Comment> | null;
	range: Range;
	type: Node["type"];
	error?: string;
	annoType?: Type; // set by ast-visitor
}

export type Node = ArrayExpression | BinaryExpression | BlockStatement | BreakStatement | MethodCallExpression | ContinueStatement | DoWhileStatement | EmptyStatement | Expression | ExpressionStatement | ForOfStatement | CstyleForStatement | FunctionDeclaration | FunctionExpression | Identifier | IfStatement | ImportDeclaration | LVal | LabeledStatement | LogicalExpression | MemberExpression | NumericLiteral | StructExpression | DictExpression | ErrorExpression | StructProperty | DictProperty | ErrorProperty | ParenthesizedExpression | Program | ReturnStatement | SequenceExpression | Statement | StringLiteral | SwitchCase | SwitchStatement | UnaryExpression | UpdateExpression | VariableDeclaration | VariableDeclarator | WhileStatement | EnumStatement | EnumEntry | ForToStatement | RepeatStatement | FunctionArgument | ProgramArgument | ModuleFunctionDeclaration | ModuleFunctionArgument | ProgramDeclaration | ScopedCallExpression | ExitStatement | CstyleForStatement | AssignStatement | InvalidExpression | MethodCallArgument | MemberCallExpression | BracketExpression | InvalidStatement;

export interface ArrayExpression extends BaseNode {
	type: "ArrayExpression";
	elements: Array<Expression>;
}

export interface InvalidExpression extends BaseNode {
	type: "InvalidExpression";
}

export interface InvalidStatement extends BaseNode {
	type: "InvalidStatement";
}

export interface BinaryExpression extends BaseNode {
	type: "BinaryExpression";
	operator: '.' | '*' | '/' | '%' | '+' | '-' | '<<' | '>>' | '<=' | '>=' | '>' | '<' | '==' | '!=' | '^' | 'in' | '&&' | '||' | 'or' | ':=' | '+=' | '-=' | '*=' | '/=' | '%=' | '.+' | '.-' | '.?';
	left: Expression;
	right: Expression;
}

export const Node = {
	children(node: Node): Node[] {
		switch (node.type) {
			case "AssignStatement": return [node.left, node.right];
			case "ArrayExpression": return [...node.elements];
			case "ArrayExpression": return [];
			case "BinaryExpression": return [node.left, node.right];
			case "BlockStatement": return [...node.body];
			case "BracketExpression": return [node.object, node.property];
			case "BreakStatement": return node.label ? [node.label] : [];
			case "MethodCallExpression": return [node.callee, ...node.arguments];
			case "MethodCallArgument": return (node.argument ? [node.argument] : [] as Node[]).concat(node.value);
			case "MemberCallExpression": return [node.callee, ...node.arguments];
			case "ContinueStatement": return node.label ? [node.label] : [];
			case "CstyleForStatement": return (node.init ? [node.init] as Node[] : []).concat(node.test ? [node.test] : []).concat(node.update ? [node.update] : []).concat([node.body]);
			case "DictExpression": return [...node.properties];
			case "DictProperty": return ([node.key] as Node[]).concat(node.value ? [node.value] : []);
			case "DoWhileStatement": return [node.test, node.body];
			case "EmptyStatement": return [];
			case "EnumEntry": return ([node.id] as Node[]).concat(node.value ? [node.value] : []);
			case "EnumStatement": return [node.id, ...node.decls];
			case "ErrorExpression": return [...node.properties];
			case "ErrorProperty": return ([node.key] as Node[]).concat(node.value ? [node.value] : []);
			case "ExitStatement": return [];
			case "ExpressionStatement": return [node.expression];
			case "ForOfStatement": return [node.left, node.right, node.body];
			case "ForToStatement": return [node.id, node.from, node.to, node.body];
			case "FunctionArgument": return ([node.id] as Node[]).concat(node.init ? [node.init] : []);
			case "FunctionDeclaration": return ([node.id, ...node.params] as Node[]).concat(node.body ? [node.body] : []);
			case "FunctionExpression": return [node.id];
			case "Identifier": return [];
			case "IfStatement": return ([node.test, node.consequent] as Node[]).concat(node.alternate ? [node.alternate] : []);
			case "ImportDeclaration": return [node.source];
			case "InvalidExpression": return [];
			case "InvalidStatement": return [];
			case "LabeledStatement": return [node.label, node.body];
			case "LogicalExpression": return [node.left, node.right];
			case "MemberExpression": return [node.object, node.property];
			case "ModuleFunctionArgument": return ([node.id] as Node[]).concat(node.init ? [node.init] : []);
			case "ModuleFunctionDeclaration": return [node.id, ...node.params];
			case "NumericLiteral": return [];
			case "ParenthesizedExpression": return [node.expression];
			case "Program": return [...node.body];
			case "ProgramArgument": return ([node.id] as Node[]).concat(node.init ? [node.init] : []);
			case "ProgramDeclaration": return [node.id, ...node.params, node.body];
			case "RepeatStatement": return [node.test, node.body];
			case "ReturnStatement": return node.argument ? [node.argument] : [];
			case "ScopedCallExpression": return [node.namespace, node.call];
			case "SequenceExpression": return [...node.expressions];
			case "StringLiteral": return [];
			case "StructExpression": return [...node.properties];
			case "StructProperty": return ([node.key] as Node[]).concat(node.value ? [node.value] : []);
			case "SwitchCase": return ((node.test ? [node.test] : []) as Node[]).concat(...node.consequent);
			case "SwitchStatement": return [node.discriminant, ...node.cases];
			case "UnaryExpression": return [node.argument];
			case "UpdateExpression": return [node.argument];
			case "VariableDeclaration": return [...node.declarations];
			case "VariableDeclarator": return ([node.id] as Node[]).concat(node.init ? [node.init] : []);
			case "WhileStatement": return [node.test, node.body];
		}
	},

	find(root: Node, where: Position, cb?: (n: Node) => void): Node | null {
		if (!containsPosition(root.range, where)) {
			return null;
		}
		let current = root;
		outer:
		do {
			if (cb) {
				cb(current);
			}
			for (const child of this.children(current)) {
				if (containsPosition(child.range, where)) {
					current = child;
					continue outer;
				}
			}
			break;
		} while (true);

		return current;
	},

	visitChildren(root: Node, cb: (n: Node) => void): void {
		let nodes = [root];
		cb(root);

		let current: Node | undefined;
		while (current = nodes.shift()) {
			for (const child of this.children(current)) {
				cb(child);
				nodes.push(child);
			}
		}
	}
};

export const Loop = {
	is(x: Node): x is Loop {
		switch (x.type) {
			case 'ForOfStatement':
			case 'CstyleForStatement':
			case 'ForToStatement':
			case 'RepeatStatement':
			case 'DoWhileStatement':
			case 'WhileStatement':

				return true;
		}
		return false;
	}
}

export interface BlockStatement extends BaseNode {
	type: "BlockStatement";
	body: Array<Statement>;
}

export interface BreakStatement extends BaseNode {
	type: "BreakStatement";
	label: Identifier | null;
}

export interface ScopedCallExpression extends BaseNode {
	type: "ScopedCallExpression";
	namespace: Identifier;
	call: MethodCallExpression;
}

export interface MethodCallExpression extends BaseNode {
	type: "MethodCallExpression";
	callee: Identifier;
	arguments: Array<MethodCallArgument>;
}

export interface MethodCallArgument extends BaseNode {
	type: "MethodCallArgument";
	argument: Identifier | null;
	value: Expression;
}

export interface MemberCallExpression extends BaseNode {
	type: "MemberCallExpression";
	callee: MemberExpression;
	arguments: Array<Expression>;
}

export interface ContinueStatement extends BaseNode {
	type: "ContinueStatement";
	label: Identifier | null;
}

export interface DoWhileStatement extends BaseNode {
	type: "DoWhileStatement";
	test: Expression;
	body: Statement;
}

export interface RepeatStatement extends BaseNode {
	type: "RepeatStatement";
	test: Expression;
	body: Statement;
}


/** @TODO this should be implemeneted */
export interface EmptyStatement extends BaseNode {
	type: "EmptyStatement";
}

export interface ExpressionStatement extends BaseNode {
	type: "ExpressionStatement";
	expression: Expression;
	terminated: boolean;
}

export interface AssignStatement extends BaseNode {
	type: "AssignStatement";
	operator: ':=';
	left: LVal;
	right: Expression;
}

export interface CstyleForStatement extends BaseNode {
	type: "CstyleForStatement";
	init: VariableDeclaration | Expression | null;
	test: Expression | null;
	update: Expression | null;
	body: Statement;
}

export interface FunctionDeclaration extends BaseNode {
	type: "FunctionDeclaration";
	id: Identifier;
	params: Array<FunctionArgument>;
	exported: boolean;
	body: BlockStatement | null;
}

export interface ProgramDeclaration extends BaseNode {
	type: "ProgramDeclaration";
	id: Identifier;
	params: Array<ProgramArgument>;
	body: BlockStatement;
}

export interface ModuleFunctionDeclaration extends BaseNode {
	type: "ModuleFunctionDeclaration";
	id: Identifier;
	params: Array<ModuleFunctionArgument>;
}

export interface FunctionExpression extends BaseNode {
	type: "FunctionExpression";
	id: Identifier;
}

export interface ProgramArgument extends BaseNode {
	type: "ProgramArgument";
	id: Identifier;
	unused: boolean;
	init: Expression | null;
}

export interface ModuleFunctionArgument extends BaseNode {
	type: "ModuleFunctionArgument";
	id: Identifier;
	init: Expression | null;
}
export interface FunctionArgument extends BaseNode {
	type: "FunctionArgument";
	id: Identifier;
	byref: boolean;
	unused: boolean;
	init: Expression | null;
}
export interface Identifier extends BaseNode {
	type: "Identifier";
	name: string;
}

export interface IfStatement extends BaseNode {
	type: "IfStatement";
	test: Expression;
	consequent: Statement;
	alternate: Statement | null;
}

export interface LabeledStatement extends BaseNode {
	type: "LabeledStatement";
	label: Identifier;
	body: Statement;
}

export interface StringLiteral extends BaseNode {
	type: "StringLiteral";
	value: string;
}

export interface NumericLiteral extends BaseNode {
	type: "NumericLiteral";
	value: number;
}

// export interface NullLiteral extends BaseNode {
// 	type: "NullLiteral";
// }


export interface LogicalExpression extends BaseNode {
	type: "LogicalExpression";
	operator: "||" | "&&" | "?:";
	left: Expression;
	right: Expression;
}

export interface MemberExpression extends BaseNode {
	type: "MemberExpression";
	object: Expression;
	property: StringLiteral | Identifier | InvalidExpression;
}

export interface BracketExpression extends BaseNode {
	type: "BracketExpression";
	object: Expression;
	property: Expression;
}

export interface Program extends BaseNode {
	type: "Program";
	body: Array<Statement>;
	sourceType: "script" | "module" | "include";
	sourceFile: string;
}

export interface StructExpression extends BaseNode {
	type: "StructExpression";
	properties: Array<StructProperty>;
}
export interface ErrorExpression extends BaseNode {
	type: "ErrorExpression";
	properties: Array<ErrorProperty | StructProperty>;
}
export interface DictExpression extends BaseNode {
	type: "DictExpression";
	properties: Array<DictProperty>;
}


export interface StructProperty extends BaseNode {
	type: "StructProperty";
	key: StringLiteral | Identifier | InvalidExpression;
	value: Expression | null;
}

export interface ErrorProperty extends BaseNode {
	type: "ErrorProperty";
	key: StringLiteral | Identifier;
	value: Expression | null;
}
export interface DictProperty extends BaseNode {
	type: "DictProperty";
	key: Expression;
	value: Expression | null;
}



export interface EnumStatement extends BaseNode {
	type: "EnumStatement";
	id: Identifier;
	decls: EnumEntry[];
}

export interface EnumEntry extends BaseNode {
	type: "EnumEntry";
	id: Identifier;
	value: Expression | null;
}
export interface ReturnStatement extends BaseNode {
	type: "ReturnStatement";
	argument: Expression | null;
}

export interface ExitStatement extends BaseNode {
	type: "ExitStatement";
}


export interface SequenceExpression extends BaseNode {
	type: "SequenceExpression";
	expressions: Array<Expression>;
}

/** @TODO implement this */
export interface ParenthesizedExpression extends BaseNode {
	type: "ParenthesizedExpression";
	expression: Expression;
}

export interface SwitchCase extends BaseNode {
	type: "SwitchCase";
	test: Expression | null;
	consequent: Array<Statement>;
}

export interface SwitchStatement extends BaseNode {
	type: "SwitchStatement";
	discriminant: Expression;
	cases: Array<SwitchCase | InvalidStatement>;
}

export interface UnaryExpression extends BaseNode {
	type: "UnaryExpression";
	operator: "!" | "+" | "-" | "~";
	argument: Expression;
	prefix: boolean;
}

export interface UpdateExpression extends BaseNode {
	type: "UpdateExpression";
	operator: "++" | "--";
	argument: Expression;
	prefix: boolean;
}

export interface VariableDeclaration extends BaseNode {
	type: "VariableDeclaration";
	kind: "var" | "const";
	declarations: Array<VariableDeclarator>;
}

export interface VariableDeclarator extends BaseNode {
	type: "VariableDeclarator";
	id: Identifier;
	init: Expression | null;
}

export interface WhileStatement extends BaseNode {
	type: "WhileStatement";
	test: Expression;
	body: Statement;
}

export interface ForOfStatement extends BaseNode {
	type: "ForOfStatement";
	left: Identifier;
	right: Expression;
	body: BlockStatement;
}

export interface ForToStatement extends BaseNode {
	type: "ForToStatement";
	id: Identifier;
	from: Expression;
	to: Expression;
	body: BlockStatement;
}

export interface ImportDeclaration extends BaseNode {
	type: "ImportDeclaration";
	source: StringLiteral | Identifier | InvalidExpression;
	importKind: "module" | "include";
}

export type Expression = ArrayExpression | BinaryExpression | MethodCallExpression | FunctionExpression | Identifier | StringLiteral | NumericLiteral | LogicalExpression | MemberExpression | StructExpression | DictExpression | ErrorExpression | SequenceExpression | ParenthesizedExpression | UnaryExpression | UpdateExpression | ScopedCallExpression | InvalidExpression | MemberCallExpression | BracketExpression;
export type ForStatement = ForOfStatement | CstyleForStatement | ForToStatement;
export type Loop = ForStatement | RepeatStatement | DoWhileStatement | WhileStatement;
export type Statement = BlockStatement | BreakStatement | ContinueStatement | DoWhileStatement | EmptyStatement | ExpressionStatement | CstyleForStatement | FunctionDeclaration | IfStatement | LabeledStatement | ReturnStatement | SwitchStatement | VariableDeclaration | WhileStatement | ForStatement | ImportDeclaration | EnumStatement | RepeatStatement | ModuleFunctionDeclaration | ProgramDeclaration | ExitStatement | AssignStatement | InvalidStatement;
export type LVal = Identifier | MemberExpression;
export type Literal = NumericLiteral | StringLiteral;

export function toJSON(node: Node, space?: number) {
	function replacer(name: string, val: any) {
		if (name === 'range') {
			return `${val?.start?.line}:${val?.start?.character} - ${val?.end?.line}:${val?.end?.character}`
		} else if (val === null && (name === 'leadingComments' || name === 'trailingComments')) {
			return undefined;
		} else {
			return val; // return as is
		}
	};
	/** @TODO fix this to not be parse-of-string but return-new-object */
	return JSON.parse(JSON.stringify(node, replacer, space));
}
