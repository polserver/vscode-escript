// Jest E2E is currently disabled due to issues with upgrading to v29:
//
// - https://github.com/microsoft/vscode/issues/175548
// - https://github.com/jestjs/jest/issues/14095
//
// The E2E tests were just POC anyway, so okay for now.

const path = require('path');

module.exports = {
    rootDir: 'test',
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: { '^.+\\.tsx?$': 'ts-jest' },
    verbose: true,
    testEnvironment: path.resolve('.', 'test', 'setup', 'vscode-environment.js'),
    modulePaths: ['<rootDir>'],
    moduleNameMapper: {
        vscode: path.join(__dirname, 'test', 'setup', 'vscode.js'),
    },
};
