const { resolve } = require('path');
const rootDir = resolve(__dirname, '..');

module.exports = {
    // rootDir,
    // rootDir: resolve('.'),
    rootDir: '.', // resolve('.'),
    testMatch: [
	  '**/__tests__/**/*.+(ts|tsx|js)',
	  '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: {
	  '^.+\\.(ts|tsx)$': 'ts-jest'
    },
};
