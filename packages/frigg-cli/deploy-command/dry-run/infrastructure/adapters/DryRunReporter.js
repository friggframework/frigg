const chalk = require('chalk');

class DryRunReporter {
    constructor({ format = 'console' } = {}) {
        if (format !== 'console' && format !== 'json') {
            throw new Error('Invalid format: must be "console" or "json"');
        }
        this.format = format;
    }

    report(report) {
        if (this.format === 'json') {
            return this._formatJson(report);
        }
        return this._formatConsole(report);
    }

    display(report) {
        const output = this.report(report);
        console.log(output);
    }

    _formatJson(report) {
        return JSON.stringify(report.toObject(), null, 2);
    }

    _formatConsole(report) {
        const sections = [];

        sections.push(this._formatHeader());
        sections.push(this._formatAppConfiguration(report));
        sections.push(this._formatEnvironmentVariables(report));

        if (report.discovery) {
            sections.push(this._formatDiscovery(report));
        }

        if (report.template) {
            sections.push(this._formatTemplate(report));
        }

        if (report.changeSet) {
            sections.push(this._formatChangeSet(report));
        }

        if (report.impact) {
            sections.push(this._formatImpact(report));
        }

        sections.push(this._formatSummary(report));
        sections.push(this._formatNextSteps(report));

        return sections.join('\n\n');
    }

    _formatHeader() {
        return [
            chalk.cyan.bold('🔍 Frigg Deploy Dry-Run'),
            chalk.gray('━'.repeat(60)),
        ].join('\n');
    }

    _formatAppConfiguration(report) {
        return [
            chalk.blue.bold('📋 App Configuration'),
            `  Service: ${chalk.white(report.stackName)}`,
            `  Stage: ${chalk.white(report.stage)}`,
            `  Region: ${chalk.white(report.region)}`,
        ].join('\n');
    }

    _formatEnvironmentVariables(report) {
        const lines = [chalk.blue.bold('🔧 Environment Variables')];

        if (!report.environment) {
            lines.push('  No environment validation performed');
            return lines.join('\n');
        }

        const { metadata, errors, warnings } = report.environment;

        if (metadata.required) {
            const requiredPresent = metadata.required.present?.length || 0;
            const requiredMissing = metadata.required.missing?.length || 0;

            if (requiredPresent > 0) {
                lines.push(chalk.green(`  ✓ ${requiredPresent} required variables present`));
            }

            if (requiredMissing > 0) {
                lines.push(chalk.red(`  ✗ ${requiredMissing} required variables missing:`));
                metadata.required.missing.forEach((varName) => {
                    lines.push(chalk.red(`      - ${varName}`));
                });
            }
        }

        if (metadata.optional) {
            const optionalMissing = metadata.optional.missing?.length || 0;

            if (optionalMissing > 0) {
                lines.push(chalk.yellow(`  ⚠️  ${optionalMissing} optional variables missing:`));
                metadata.optional.missing.forEach((varName) => {
                    lines.push(chalk.yellow(`      - ${varName}`));
                });
            }
        }

        return lines.join('\n');
    }

    _formatDiscovery(report) {
        const lines = [chalk.blue.bold('🌐 AWS Resource Discovery')];
        const { discovery } = report;

        if (discovery.vpc) {
            const vpcInfo = discovery.vpc.cidr
                ? `${discovery.vpc.id} (${discovery.vpc.cidr})`
                : discovery.vpc.id;
            lines.push(chalk.green(`  ✓ VPC: ${vpcInfo}`));
        }

        if (discovery.subnets && discovery.subnets.length > 0) {
            lines.push(chalk.green(`  ✓ Subnets: ${discovery.subnets.join(', ')}`));
        }

        if (discovery.securityGroups && discovery.securityGroups.length > 0) {
            lines.push(chalk.green(`  ✓ Security Group: ${discovery.securityGroups.join(', ')}`));
        }

        if (discovery.kmsKey) {
            const kmsDisplay =
                discovery.kmsKey.length > 60
                    ? discovery.kmsKey.substring(0, 57) + '...'
                    : discovery.kmsKey;
            lines.push(chalk.green(`  ✓ KMS Key: ${kmsDisplay}`));
        }

        return lines.join('\n');
    }

    _formatTemplate(report) {
        const lines = [chalk.blue.bold('📦 Generated Template Summary')];
        const { template } = report;

        if (template.functions) {
            lines.push(chalk.white(`  Functions: ${template.functions.count}`));

            if (template.functions.details) {
                template.functions.details.forEach((fn) => {
                    lines.push(
                        chalk.gray(`    - ${fn.name} (${fn.memory}MB, ${fn.timeout}s timeout)`)
                    );
                });
            }
        }

        if (template.endpoints) {
            lines.push('');
            lines.push(chalk.white(`  API Endpoints: ${template.endpoints.count}`));

            if (template.endpoints.methods) {
                template.endpoints.methods.forEach((endpoint) => {
                    lines.push(chalk.gray(`    - ${endpoint}`));
                });
            }
        }

        return lines.join('\n');
    }

    _formatChangeSet(report) {
        const lines = [chalk.blue.bold('🔄 CloudFormation Change Set Preview')];
        const { changeSet } = report;

        lines.push(`  Stack: ${chalk.white(changeSet.stackName)}`);

        const { summary } = changeSet;

        if (
            summary.add === 0 &&
            summary.modify === 0 &&
            summary.remove === 0 &&
            summary.replace === 0
        ) {
            lines.push('');
            lines.push(chalk.yellow('  No changes detected'));
            return lines.join('\n');
        }

        lines.push('');
        lines.push(chalk.white('  Changes:'));

        const grouped = this._groupChangesByAction(changeSet.changes);

        if (summary.add > 0) {
            lines.push(chalk.green(`  ✓ Add (${summary.add}):`));
            grouped.Add.forEach((change) => {
                lines.push(
                    chalk.green(`    - ${change.logicalId} (${change.resourceType})`)
                );
            });
        }

        if (summary.modify > 0) {
            lines.push(chalk.yellow(`  ⚠️  Modify (${summary.modify}):`));
            grouped.Modify.forEach((change) => {
                lines.push(
                    chalk.yellow(`    - ${change.logicalId} (${change.resourceType})`)
                );

                if (change.details && change.details.length > 0) {
                    change.details.forEach((detail) => {
                        if (detail.attribute) {
                            lines.push(chalk.gray(`      • ${detail.attribute}`));
                        }
                    });
                }
            });
        }

        if (summary.replace > 0) {
            lines.push(chalk.red(`  🔄 Replace (${summary.replace}):`));
            grouped.Replace.forEach((change) => {
                lines.push(
                    chalk.red(`    - ${change.logicalId} (${change.resourceType})`)
                );
                if (change.replacementReason) {
                    lines.push(chalk.gray(`      Reason: ${change.replacementReason}`));
                }
            });
        }

        if (summary.remove > 0) {
            lines.push(chalk.red(`  ⚠️  Remove (${summary.remove}):`));
            grouped.Remove.forEach((change) => {
                lines.push(
                    chalk.red(`    - ${change.logicalId} (${change.resourceType})`)
                );
            });
        }

        return lines.join('\n');
    }

    _groupChangesByAction(changes) {
        const grouped = {
            Add: [],
            Modify: [],
            Replace: [],
            Remove: [],
        };

        changes.forEach((change) => {
            if (change.replacement === 'True') {
                grouped.Replace.push(change);
            } else if (change.action === 'Add') {
                grouped.Add.push(change);
            } else if (change.action === 'Modify') {
                grouped.Modify.push(change);
            } else if (change.action === 'Remove') {
                grouped.Remove.push(change);
            }
        });

        return grouped;
    }

    _formatImpact(report) {
        const lines = [chalk.blue.bold('📊 Deployment Impact')];
        const { impact } = report;

        if (impact.downtime) {
            lines.push(`  Estimated Downtime: ${chalk.yellow(impact.downtime)}`);
        }

        if (impact.functionsAffected !== undefined) {
            lines.push(`  Functions Affected: ${chalk.white(impact.functionsAffected)}`);
        }

        if (impact.coldStarts) {
            lines.push(chalk.yellow('  Cold Starts Expected: All functions'));
        }

        if (impact.breakingChanges) {
            lines.push(chalk.red('  Breaking Changes: Detected'));
        } else {
            lines.push(chalk.green('  Breaking Changes: None detected'));
        }

        return lines.join('\n');
    }

    _formatSummary(report) {
        const lines = [chalk.blue.bold('✅ Dry-Run Summary')];

        if (report.status.isSuccess()) {
            lines.push(chalk.green('  ✓ Dry-run completed successfully'));
        } else if (report.status.hasWarnings()) {
            lines.push(chalk.yellow('  ⚠️  Dry-run completed with warnings'));
        } else if (report.status.hasErrors()) {
            lines.push(chalk.red('  ✗ Dry-run failed validation'));
        }

        if (report.environment && report.environment.hasWarnings()) {
            report.environment.warnings.forEach((warning) => {
                lines.push(chalk.yellow(`  ⚠️  ${warning}`));
            });
        }

        if (report.environment && report.environment.hasErrors()) {
            report.environment.errors.forEach((error) => {
                lines.push(chalk.red(`  ✗ ${error}`));
            });
        }

        return lines.join('\n');
    }

    _formatNextSteps(report) {
        const lines = [chalk.blue.bold('Next Steps')];

        if (report.hasErrors()) {
            lines.push(
                chalk.red('  Fix the errors above before attempting deployment')
            );
        } else {
            lines.push(chalk.white('  To execute this deployment, run:'));
            lines.push(chalk.cyan(`    frigg deploy --stage ${report.stage}`));

            if (report.hasWarnings()) {
                lines.push('');
                lines.push(chalk.yellow('  To skip environment validation, run:'));
                lines.push(
                    chalk.cyan(`    frigg deploy --stage ${report.stage} --skip-env-validation`)
                );
            }
        }

        return lines.join('\n');
    }
}

module.exports = { DryRunReporter };
