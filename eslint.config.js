const eslintParser = require('@typescript-eslint/parser');

module.exports = [
    {
        languageOptions: {
            parser: eslintParser
        },
        files: ['**/*.ts', '**/*.js'],
        rules: {
            'semi': 'error',
            'no-extra-semi': 'warn',
            'curly': 'warn',
            'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
            'eqeqeq': 'error',
            'indent': ['warn', 4]
        }
    },
    {
        ignores: [
            'node_modules/**',
            'client/node_modules/**',
            'client/.vscode-test/**',
            'client/out/**',
            'server/node_modules/**',
            'server/out/**',
            'server/src/grammars/**',
            'native/node_modules/**',
            'native/polserver/**',
            'native/out/**',
            'coverage',
        ]
    }
];