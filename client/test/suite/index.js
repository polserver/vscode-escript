const path = require('path');
const { runCLI } = require('@jest/core');

const VSCodeJestRunner = {
    async run(testsRoot, reportTestResults) {
        const projectRootPath = path.join(__dirname, '../..');
        const config = path.join(projectRootPath, 'jest.e2e.config.js');
        console.error('config is',require(config));

        try {
            const jestCliCallResult = await runCLI({ config }, [projectRootPath]);
            jestCliCallResult.results.testResults.forEach((testResult) => {
                testResult.testResults
                    .filter((assertionResult) => assertionResult.status === 'passed')
                    .forEach(({ ancestorTitles, title, status }) => {
                        console.info(`  ● ${ancestorTitles} › ${title} (${status})`);
                    });
            });

            jestCliCallResult.results.testResults.forEach((testResult_1) => {
                if (testResult_1.failureMessage) {
                    console.error(testResult_1.failureMessage);
                }
            });

            reportTestResults(undefined, jestCliCallResult.results.numFailedTests);
        } catch (errorCaughtByJestRunner) {
            reportTestResults(errorCaughtByJestRunner, 0);
        }
    },
};

module.exports = VSCodeJestRunner;
