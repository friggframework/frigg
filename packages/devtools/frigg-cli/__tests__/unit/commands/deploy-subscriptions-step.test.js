/**
 * The post-deploy webhook subscription step: add-only by default, prune on request, never fails the deploy.
 */
const { reconcileSubscriptionsAfterDeploy } = require('../../../deploy-command/subscriptions-step');

describe('reconcileSubscriptionsAfterDeploy', () => {
    let log;
    beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => log.mockRestore());

    const result = { extension: 'hubspot-webhooks', created: ['deal.creation'], removed: [], kept: [], remove: ['company.deletion'] };
    const define = (impl) => ({ reconcileAppSubscriptions: jest.fn(impl || (async () => [result])) });

    it('runs add-only without a database by default', async () => {
        const d = define();
        const integrations = [function A() {}];
        await reconcileSubscriptionsAfterDeploy({ integrations }, {}, { define: d });
        expect(d.reconcileAppSubscriptions).toHaveBeenCalledWith({ integrations, listInstallations: null, prune: false });
        expect(log.mock.calls.flat().join('\n')).toMatch(/1 not needed by any binding \(kept; --prune-subscriptions removes them\)/);
    });

    it('prunes with --prune-subscriptions', async () => {
        const d = define();
        await reconcileSubscriptionsAfterDeploy({ integrations: [] }, { pruneSubscriptions: true }, { define: d });
        expect(d.reconcileAppSubscriptions.mock.calls[0][0].prune).toBe(true);
    });

    it('is skipped with --skip-subscriptions, and a failure never fails the deploy', async () => {
        const d = define();
        expect(await reconcileSubscriptionsAfterDeploy({}, { skipSubscriptions: true }, { define: d })).toBeNull();
        expect(d.reconcileAppSubscriptions).not.toHaveBeenCalled();
        const failing = define(async () => { throw new Error('provider down'); });
        await expect(reconcileSubscriptionsAfterDeploy({ integrations: [] }, {}, { define: failing })).resolves.toBeNull();
    });
});
