import { AbstractParseTreeVisitor, ParseTree, RuleNode } from 'antlr4ts/tree';

export abstract class AsyncAbstractParseTreeVisitor<Result> extends AbstractParseTreeVisitor<Result | Promise<Result>> {

	public visit(tree: ParseTree): Result | Promise<Result> {
		return tree.accept(this);
	}

	public async visitChildren(node: RuleNode): Promise<Result> {
		let result: Result = await this.defaultResult();
		let n: number = node.childCount;
		for (let i = 0; i < n; i++) {
			if (!this.shouldVisitNextChild(node, result)) {
				break;
			}
			let c: ParseTree = node.getChild(i);
			let childResult: Result = await c.accept(this);
			result = await this.aggregateResult(result, childResult);
		}
		return result;
	}
}
