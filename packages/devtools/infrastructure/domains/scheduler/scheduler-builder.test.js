/**
 * Tests for Scheduler Builder
 */

const { SchedulerBuilder } = require('./scheduler-builder');

describe('SchedulerBuilder', () => {
    let schedulerBuilder;
    const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

    beforeEach(() => {
        schedulerBuilder = new SchedulerBuilder();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        if (originalSkipDiscovery === undefined) {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        } else {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
        }
    });

    describe('shouldExecute()', () => {
        it('runs when explicitly enabled', () => {
            expect(
                schedulerBuilder.shouldExecute({ scheduler: { enable: true } })
            ).toBe(true);
        });

        it('runs when any integration has webhooks', () => {
            expect(
                schedulerBuilder.shouldExecute({
                    integrations: [
                        { Definition: { name: 'a', webhooks: true } },
                    ],
                })
            ).toBe(true);
        });

        it('runs when any module declares a rate limit', () => {
            class Api {
                static rateLimit = { minRetryAfterMs: 1_000 };
            }
            expect(
                schedulerBuilder.shouldExecute({
                    integrations: [
                        { Definition: { name: 'a' } },
                        {
                            Definition: {
                                name: 'b',
                                modules: { crm: { definition: { API: Api } } },
                            },
                        },
                    ],
                })
            ).toBe(true);
        });

        it('skips a module whose API declares no rate limit', () => {
            class Api {}
            expect(
                schedulerBuilder.shouldExecute({
                    integrations: [
                        {
                            Definition: {
                                name: 'a',
                                modules: { crm: { definition: { API: Api } } },
                            },
                        },
                    ],
                })
            ).toBe(false);
        });

        it.each([
            ['no modules', { name: 'a' }],
            ['an empty modules object', { name: 'a', modules: {} }],
            [
                'a module with no definition',
                { name: 'a', modules: { crm: {} } },
            ],
            ['a null module', { name: 'a', modules: { crm: null } }],
            [
                'a definition with no API',
                { name: 'a', modules: { crm: { definition: {} } } },
            ],
        ])('skips an integration with %s', (_label, Definition) => {
            expect(
                schedulerBuilder.shouldExecute({
                    integrations: [{ Definition }],
                })
            ).toBe(false);
        });

        it('skips otherwise', () => {
            expect(
                schedulerBuilder.shouldExecute({
                    integrations: [{ Definition: { name: 'a' } }],
                })
            ).toBe(false);
        });
    });

    describe('build() environment', () => {
        const scheduledApp = (extra = {}) => ({
            scheduler: { enable: true },
            integrations: [
                { Definition: { name: 'hubspot', webhooks: true } },
                { Definition: { name: 'slack' } },
            ],
            ...extra,
        });

        it('broadcasts scheduler vars app-wide by default', async () => {
            const result = await schedulerBuilder.build(scheduledApp(), {});

            expect(result.environment.SCHEDULER_ROLE_ARN).toEqual({
                'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'],
            });
            expect(result.environment.SCHEDULE_GROUP_NAME).toEqual({
                Ref: 'FriggScheduleGroup',
            });
            expect(result.functionEnvironments).toBeUndefined();
        });

        it('scopes scheduler vars to auth, adminScriptExecutor, and integration functions with lambda.scopedEnvironment', async () => {
            const result = await schedulerBuilder.build(
                scheduledApp({
                    lambda: { scopedEnvironment: true },
                    adminScripts: [{ Definition: { name: 'fix-things' } }],
                }),
                {}
            );

            expect(result.environment.SCHEDULER_ROLE_ARN).toBeUndefined();
            expect(result.environment.SCHEDULE_GROUP_NAME).toBeUndefined();

            const scoped = result.functionEnvironments;
            for (const fnName of [
                'auth',
                'adminScriptExecutor',
                'hubspot',
                'hubspotWebhook',
                'hubspotQueueWorker',
                'slack',
                'slackQueueWorker',
            ]) {
                expect(scoped[fnName].SCHEDULER_ROLE_ARN).toEqual({
                    'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'],
                });
                expect(scoped[fnName].SCHEDULE_GROUP_NAME).toEqual({
                    Ref: 'FriggScheduleGroup',
                });
            }

            // the router keeps its own admin-scheduler role, set directly by
            // the admin-script builder — never targeted here
            expect(scoped.adminScriptRouter).toBeUndefined();
        });

        it('keeps broadcasting in local mode even with the flag on', async () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const result = await schedulerBuilder.build(
                scheduledApp({ lambda: { scopedEnvironment: true } }),
                {}
            );

            expect(result.environment.SCHEDULER_ROLE_ARN).toBeDefined();
            expect(result.functionEnvironments).toBeUndefined();
        });
    });
});
