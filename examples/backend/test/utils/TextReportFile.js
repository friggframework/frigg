const TextReport = require('istanbul-reports/lib/text');

module.exports = class TextReportFile extends TextReport {
    constructor(opts = {}) {
        opts.file = 'coverage.txt';
        super(opts);
    }
};
