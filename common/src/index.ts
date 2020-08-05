import type {
    TextDocumentIdentifier,
    ExecuteCommandParams,
} from 'vscode-languageserver';

export interface OpenAstRequestCommand extends ExecuteCommandParams {
    command: 'myExtension.sayHelloRequest'
    arguments: [{ textDocument: TextDocumentIdentifier }]
}

export interface OpenAstResponseCommand extends ExecuteCommandParams {
    command: 'myExtension.sayHelloResponse'
    arguments: [{
        textDocument: TextDocumentIdentifier
        ast: any;
    }]
}

// type CommandCheck<CommandType> = {
// 	is: (x: any) => x is CommandType;
// } & Pick<ExecuteCommandParams, 'command'>;

abstract class ExtensionCommand<T> {
	static command: string;
	static is<X>(what: any): what is X {
	    return what && what.command === this.command;
	}
}

export class OpenAstRequestCommand extends ExtensionCommand<OpenAstRequestCommand> {
	static readonly command: 'myExtension.sayHelloRequest';
	static create(tdi: TextDocumentIdentifier): OpenAstRequestCommand {
	    return { 
	        command: OpenAstRequestCommand.command, 
	        arguments: [
	            { textDocument: tdi }
	        ]
	    };
	}
}

export class OpenAstResponseCommand extends ExtensionCommand<OpenAstResponseCommand> {
	static readonly command: 'myExtension.sayHelloResponse';
	static create(tdi: TextDocumentIdentifier, ast: any): OpenAstResponseCommand {
	    return { 
	        command: OpenAstResponseCommand.command, 
	        arguments: [
	            { 
	                textDocument: tdi,
	                ast
				 }
	        ]
	    };
	}
}

