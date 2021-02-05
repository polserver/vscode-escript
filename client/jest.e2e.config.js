const path = require('path');

module.exports = {
    rootDir: 'test',
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: { '^.+\\.tsx?$': 'ts-jest' },
    verbose: true,
    testEnvironment: './test/setup/vscode-environment.js',
    modulePaths: ['<rootDir>'],
    moduleNameMapper: {
        vscode: path.join(__dirname, 'test', 'setup', 'vscode.js'),
    },
};
