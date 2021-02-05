import * as vscode from 'vscode';

it('Can activate the extension', async () => {
    const ext = vscode.extensions.getExtension('polserver.escript-lsp')!;
    await ext.activate();
    // const vscode = await import('vscode');
    // expect(vscode.window).toBeTruthy();
});
