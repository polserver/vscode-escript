const vscode = require('vscode');
const { default: NodeEnvironment } = require('jest-environment-node');

class VsCodeEnvironment extends NodeEnvironment {
    async setup() {
        await super.setup();
        this.global.vscode = vscode;
    }

    async teardown() {
        this.global.vscode = {};
        await super.teardown();
    }

    runScript(script) {
        return super.runScript(script);
    }
}

module.exports = VsCodeEnvironment;
