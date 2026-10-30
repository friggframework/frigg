const chalk = require('chalk');

function formatIssue(issue) {
    const label =
        issue.severity === 'error'
            ? chalk.red('error')
            : chalk.yellow('warning');
    const where = issue.pointer
        ? chalk.cyan(issue.pointer)
        : chalk.cyan('(definition)');
    const lines = [`  ${label} ${where}  ${issue.message}`];
    if (issue.hint) {
        lines.push(chalk.gray(`        fix: ${issue.hint}`));
    }
    return lines.join('\n');
}

/**
 * Human-readable report.
 * @param {{ errors: object[], warnings: object[], source?: string, stage?: string }} report
 */
function formatReport(report) {
    const { errors, warnings, source, stage } = report;
    const lines = [];
    const header = `Validating ${source || 'the app definition'}${
        stage ? ` (stage: ${stage})` : ''
    }`;
    lines.push(chalk.bold(header));
    for (const issue of errors) lines.push(formatIssue(issue));
    for (const issue of warnings) lines.push(formatIssue(issue));
    if (errors.length === 0 && warnings.length === 0) {
        lines.push(chalk.green('  ✓ The app definition is valid.'));
    } else {
        const summary = `${errors.length} error(s), ${warnings.length} warning(s)`;
        lines.push(
            errors.length
                ? chalk.red(`  ✗ ${summary}`)
                : chalk.yellow(`  ✓ valid, ${summary}`)
        );
    }
    return lines.join('\n');
}

/**
 * Machine-readable report (`frigg validate --json`).
 */
function toJsonReport(report) {
    const strip = ({ stack, ...issue }) => issue;
    return {
        valid: report.errors.length === 0,
        source: report.source || null,
        stage: report.stage || null,
        errors: report.errors.map(strip),
        warnings: report.warnings.map(strip),
    };
}

module.exports = { formatReport, toJsonReport };
