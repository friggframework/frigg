/**
 * netlify.toml redirects for the Management API come from core's route
 * registry, the same source as the AWS API Gateway routes, so a Netlify app
 * exposes exactly the paths an AWS app does.
 */
const {
    generateNetlifyToml,
    managementApiRedirects,
} = require('../lib/generate-netlify-config');
const {
    getGatewayRoutes,
} = require('@friggframework/core/management-api/route-registry');

const redirectsOf = (toml) =>
    [...toml.matchAll(/from = "([^"]+)"\n {2}to = "\/\.netlify\/functions\/([^"]+)"/g)].map(
        ([, from, fn]) => ({ from, fn })
    );

describe('Management API redirects', () => {
    it('cover every gateway route of the registry, on the same function', () => {
        const toml = generateNetlifyToml({ integrations: [] });
        const redirects = redirectsOf(toml);

        for (const route of getGatewayRoutes({ v1: true, proxy: false })) {
            const from = route.path.replace(/\{proxy\+\}$/, '*');
            expect(redirects).toContainEqual({ from, fn: route.function });
        }
    });

    it('include the v1 /api/entity paths #545 left out', () => {
        const redirects = redirectsOf(generateNetlifyToml({ integrations: [] }));
        expect(redirects).toContainEqual({ from: '/api/entity', fn: 'auth' });
        expect(redirects).toContainEqual({ from: '/api/entity/*', fn: 'auth' });
    });

    it('send /api/meta to the health function, as on AWS', () => {
        const redirects = redirectsOf(generateNetlifyToml({ integrations: [] }));
        expect(redirects).toContainEqual({ from: '/api/meta', fn: 'health' });
        expect(redirects).toContainEqual({ from: '/api/meta/*', fn: 'health' });
    });

    it('drop the v1 paths when managementApi.v1 is false', () => {
        const froms = managementApiRedirects({ managementApi: { v1: false } }).map((r) => r.from);
        expect(froms).not.toContain('/api/integrations');
        expect(froms).not.toContain('/api/entity');
        expect(froms).toContain('/api/v2/integrations');
    });

    it('keep a /api/v2/* fallback to auth after the per-resource routes', () => {
        const redirects = redirectsOf(generateNetlifyToml({ integrations: [] }));
        const fallback = redirects.findIndex((r) => r.from === '/api/v2/*');
        const lastV2 = redirects.map((r) => r.from).lastIndexOf('/api/v2/credentials/*');
        expect(redirects[fallback]).toEqual({ from: '/api/v2/*', fn: 'auth' });
        expect(fallback).toBeGreaterThan(lastV2);
    });

    it('route the bare webhook path before the integration catch-all', () => {
        const redirects = redirectsOf(
            generateNetlifyToml({ integrations: [{ Definition: { name: 'hubspot' } }] })
        ).map((r) => r.from);
        const bare = redirects.indexOf('/api/hubspot-integration/webhooks');
        const catchAll = redirects.indexOf('/api/hubspot-integration/*');
        expect(bare).toBeGreaterThanOrEqual(0);
        expect(bare).toBeLessThan(catchAll);
    });
});
