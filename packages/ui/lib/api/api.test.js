// Run with: npm test (node --test). No browser or bundler needed.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import API, { FriggApiVersionError } from "./api.js";

const BASE = "https://frigg.example.com";

const META_V2 = {
  api: {
    versions: {
      1: { status: "deprecated", openapi: "/api/meta/openapi/v1.json" },
      2: { status: "stable", openapi: "/api/meta/openapi/v2.json" },
    },
    preferred: "2",
  },
  capabilities: ["credentials", "multiStepAuthorize"],
};

function jsonResponse(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let calls;
let routes;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  routes = {};
  globalThis.fetch = async (url, init = {}) => {
    const path = url.replace(BASE, "");
    calls.push({ path, method: init.method, headers: init.headers, body: init.body });
    const key = `${init.method} ${path.split("?")[0]}`;
    const handler = routes[key];
    if (!handler) return jsonResponse(404, { error: { code: "NOT_FOUND" } });
    return typeof handler === "function" ? handler(path, init) : jsonResponse(200, handler);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API apiVersion option", () => {
  it("defaults to v1 and the unprefixed routes", async () => {
    routes["GET /api/integrations"] = { entities: { options: [], authorized: [] }, integrations: [] };
    const api = new API(BASE, "jwt");
    assert.equal(api.apiVersion, "v1");
    await api.listIntegrations();
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["GET /api/integrations"]);
    assert.equal(calls[0].headers.authorization, "Bearer jwt");
    assert.equal(calls[0].headers["Frigg-Client"], "@friggframework/ui");
  });

  it("rejects an unknown apiVersion", () => {
    assert.throws(() => new API(BASE, "jwt", { apiVersion: "v3" }), /apiVersion must be one of v1, v2/);
  });

  it("checks /api/meta once before the first v2 call", async () => {
    routes["GET /api/meta"] = META_V2;
    routes["GET /api/v2/credentials"] = { credentials: [] };
    const api = new API(BASE, "jwt", { apiVersion: "v2" });
    await api.listCredentials();
    await api.listCredentials();
    assert.deepEqual(calls.map((c) => c.path), ["/api/meta", "/api/v2/credentials", "/api/v2/credentials"]);
  });

  it("throws a clear upgrade error against a core without /api/meta", async () => {
    const api = new API(BASE, "jwt", { apiVersion: "v2" });
    await assert.rejects(api.listEntities(), (error) => {
      assert.ok(error instanceof FriggApiVersionError);
      assert.match(error.message, /@friggframework\/core >= 2\.0\.1/);
      assert.match(error.message, /This server serves: v1/);
      return true;
    });
    assert.deepEqual(calls.map((c) => c.path), ["/api/meta"]);
  });

  it("throws when the backend has v2 disabled or missing", async () => {
    routes["GET /api/meta"] = { api: { versions: { 1: { status: "deprecated" } } }, capabilities: [] };
    const api = new API(BASE, "jwt", { apiVersion: "v2" });
    await assert.rejects(api.listEntities(), FriggApiVersionError);
  });

  it("does not check /api/meta in v1 mode", async () => {
    routes["POST /api/authorize"] = { entity_id: "e1" };
    await new API(BASE, "jwt").authorize("acme", { code: "c" });
    assert.deepEqual(calls.map((c) => c.path), ["/api/authorize"]);
  });
});

describe("v2 mode keeps the component-facing return shapes", () => {
  let api;
  beforeEach(() => {
    routes["GET /api/meta"] = META_V2;
    api = new API(BASE, "jwt", { apiVersion: "v2" });
  });

  it("assembles the v1 combined integrations shape from three v2 calls", async () => {
    routes["GET /api/v2/integrations"] = { integrations: [{ id: "i1" }] };
    routes["GET /api/v2/integrations/options"] = { integrations: [{ type: "sync" }] };
    routes["GET /api/v2/entities"] = { entities: [{ id: "e1", type: "acme" }] };
    assert.deepEqual(await api.listIntegrations(), {
      entities: { options: [{ type: "sync" }], authorized: [{ id: "e1", type: "acme" }] },
      integrations: [{ id: "i1" }],
    });
  });

  it("copies an OAuth url to the top level of the requirements", async () => {
    routes["GET /api/v2/authorize"] = {
      type: "oauth2", data: { url: "https://provider.example/auth" }, step: 1, totalSteps: 1, isMultiStep: false,
    };
    const requirements = await api.getAuthorizeRequirements("acme", "");
    assert.equal(requirements.url, "https://provider.example/auth");
    assert.equal(calls.at(-1).path, "/api/v2/authorize?entityType=acme");
  });

  it("adds the v1 ids to a completed authorization", async () => {
    routes["POST /api/v2/authorize"] = {
      status: "complete", entity: { id: "e1", type: "acme" }, credential: { id: "c1" },
    };
    const result = await api.authorize("acme", { code: "x" });
    assert.equal(result.entity_id, "e1");
    assert.equal(result.credential_id, "c1");
    assert.equal(result.type, "acme");
    assert.deepEqual(JSON.parse(calls.at(-1).body), { entityType: "acme", data: { code: "x" } });
  });

  it("passes step and sessionId through for multi-step flows", async () => {
    routes["POST /api/v2/authorize"] = { status: "pending", step: 2, totalSteps: 2, sessionId: "s1", requirements: {} };
    const result = await api.authorize("acme", { email: "a@example.com" }, 1, "s1");
    assert.equal(result.status, "pending");
    assert.deepEqual(JSON.parse(calls.at(-1).body), {
      entityType: "acme", data: { email: "a@example.com" }, step: 1, sessionId: "s1",
    });
  });

  it("uses v2 integration paths and a GET for user actions", async () => {
    routes["GET /api/v2/integrations/i1/actions"] = {};
    routes["POST /api/v2/integrations/i1/actions/SYNC"] = {};
    routes["DELETE /api/v2/integrations/i1"] = (path) => jsonResponse(204);
    await api.getUserActions("i1", "QUICK");
    await api.submitUserAction("i1", "SYNC", { a: 1 });
    assert.equal(await api.deleteIntegration("i1"), undefined);
    assert.deepEqual(
      calls.filter((c) => c.path !== "/api/meta").map((c) => `${c.method} ${c.path}`),
      [
        "GET /api/v2/integrations/i1/actions?actionType=QUICK",
        "POST /api/v2/integrations/i1/actions/SYNC",
        "DELETE /api/v2/integrations/i1",
      ]
    );
  });
});

describe("v2-only methods", () => {
  it("call the v2 routes that exist", async () => {
    routes["GET /api/meta"] = { ...META_V2, capabilities: [...META_V2.capabilities, "entityProxy"] };
    const api = new API(BASE, "jwt", { apiVersion: "v2" });
    const expected = [
      [() => api.listEntityTypes(), "GET /api/v2/entities/types"],
      [() => api.getEntityType("acme"), "GET /api/v2/entities/types/acme"],
      [() => api.getEntityTypeRequirements("acme", 2), "GET /api/v2/entities/types/acme/requirements?step=2"],
      [() => api.getEntity("e1"), "GET /api/v2/entities/e1"],
      [() => api.testEntityAuth("e1"), "GET /api/v2/entities/e1/test-auth"],
      [() => api.getEntityOptions("e1"), "GET /api/v2/entities/e1/options"],
      [() => api.refreshEntityOptions("e1", { q: 1 }), "POST /api/v2/entities/e1/options/refresh"],
      [() => api.deleteEntity("e1"), "DELETE /api/v2/entities/e1"],
      [() => api.getCredential("c1"), "GET /api/v2/credentials/c1"],
      [() => api.deleteCredential("c1"), "DELETE /api/v2/credentials/c1"],
      [() => api.getCredentialReauthorizeRequirements("c1", { step: 2, sessionId: "s" }), "GET /api/v2/credentials/c1/reauthorize?step=2&sessionId=s"],
      [() => api.reauthorizeCredential("c1", { code: "x" }), "POST /api/v2/credentials/c1/reauthorize"],
      [() => api.getIntegration("i1"), "GET /api/v2/integrations/i1"],
      [() => api.testIntegrationAuth("i1"), "GET /api/v2/integrations/i1/test-auth"],
      [() => api.proxyEntityRequest("e1", { method: "GET", path: "/x" }), "POST /api/v2/entities/e1/proxy"],
    ];
    for (const [call, route] of expected) {
      routes[route.split("?")[0]] = {};
      await call();
      assert.equal(`${calls.at(-1).method} ${calls.at(-1).path}`, route);
    }
    assert.equal(await api.hasCapability("entityProxy"), true);
    assert.equal(await api.hasCapability("somethingElse"), false);
  });
});
