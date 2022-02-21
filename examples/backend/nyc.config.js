const path = require('path');

const { CI } = process.env;
const isCiEnvironment = CI === 'true';

const textFileReporterPath = path.join(
    __dirname,
    './test/utils/TextReportFile'
);

const reporters = isCiEnvironment
    ? [textFileReporterPath]
    : ['text-summary', 'html'];

module.exports = {
    'check-coverage': true,
    reporter: reporters,
    statements: [22, 80],
    branches: [2, 80],
    functions: [6, 80],
    lines: [22, 80],
};
