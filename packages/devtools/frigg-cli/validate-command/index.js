/**
 * `frigg validate` and the validation step that `frigg build`, `frigg deploy`,
 * `frigg start` and `frigg init` run first (ADR-051).
 */

const chalk = require('chalk');
const { loadAppDefinition } = require('./load-app-definition');
const { validateDefinition } = require('./validate-app-definition');
const { formatReport, toJsonReport } = require('./format-report');

/**
 * Load the backend's app definition the way build does and validate it.
 *
 * @param {object} [params]
 * @param {string} [params.cwd]
 * @param {string} [params.stage]
 * @param {object} [params.env]
 * @returns {{ errors: object[], warnings: object[], source: string, stage?: string }}
 */
function runValidation({ cwd = process.cwd(), stage, env = process.env } = {}) {
    const loaded = loadAppDefinition({ cwd });
    if (!loaded.ok) {
        return { errors: [loaded.issue], warnings: [], source: cwd, stage };
    }
    const { errors, warnings } = validateDefinition({
        definition: loaded.definition,
        stage,
        env,
    });
    return { errors, warnings, source: loaded.indexPath, stage };
}

/**
 * `frigg validate [--json] [--stage <stage>]`. Exits non-zero on errors.
 */
async function validateCommand(options = {}) {
    const report = runValidation({ stage: options.stage });
    if (options.json) {
        console.log(JSON.stringify(toJsonReport(report), null, 2));
    } else {
        console.log(formatReport(report));
        const stack = report.errors.find((issue) => issue.stack)?.stack;
        if (stack && options.verbose) console.log(chalk.gray(stack));
    }
    if (report.errors.length > 0) {
        process.exitCode = 1;
    }
    return report;
}

/**
 * Validation step run before another command.
 *
 * @param {object} params
 * @param {string} params.command the command name, for messages
 * @param {object} params.options the command's options (stage, skipValidate)
 * @param {boolean} params.failOnErrors exit 1 on errors (build, deploy);
 *   false prints errors as warnings (start)
 * @returns {boolean} true when the command may continue
 */
function preflightValidation({ command, options = {}, failOnErrors }) {
    if (options.skipValidate) {
        console.warn(
            chalk.bgYellow.black(' VALIDATION SKIPPED ') +
                chalk.yellow(
                    ` frigg ${command} --skip-validate: the app definition was not validated. Run \`frigg validate\` to see what was skipped.`
                )
        );
        return true;
    }

    const report = runValidation({ stage: options.stage });
    const { errors, warnings } = report;
    if (errors.length === 0 && warnings.length === 0) {
        console.log(chalk.green('✓ App definition is valid'));
        return true;
    }

    if (failOnErrors || errors.length === 0) {
        console.log(formatReport(report));
    } else {
        // frigg start: report errors without stopping local development.
        console.log(
            formatReport({
                ...report,
                errors: [],
                warnings: [
                    ...errors.map((e) => ({ ...e, severity: 'warning' })),
                    ...warnings,
                ],
            })
        );
    }

    if (errors.length > 0 && failOnErrors) {
        console.error(
            chalk.red(
                `\n✗ frigg ${command} stopped: the app definition has ${errors.length} error(s). Fix them, or rerun with --skip-validate to bypass.`
            )
        );
        process.exit(1);
        return false;
    }
    return true;
}

module.exports = { validateCommand, runValidation, preflightValidation };
