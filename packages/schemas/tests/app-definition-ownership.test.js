const { validateAppDefinition, validateIntegrationDefinition } = require("../index");

const baseDefinition = {
  name: "test-app",
  provider: "aws",
  integrations: [],
};

const validate = (extra) => validateAppDefinition({ ...baseDefinition, ...extra });

describe("app-definition schema: ownership (ADR-056 §3)", () => {
  it("stays optional", () => {
    expect(validate({}).valid).toBe(true);
  });

  it("accepts a scope, a default with an allow list, and individualAcross", () => {
    expect(validate({ ownership: { scope: "organization" } }).valid).toBe(true);
    expect(
      validate({
        ownership: {
          scope: { default: "organization", allow: ["organization", "individual"] },
          individualAcross: "all",
        },
      }).valid
    ).toBe(true);
    expect(validate({ ownership: { individualAcross: "organization" } }).valid).toBe(true);
  });

  it.each([
    [{ scope: "team" }],
    [{ scope: { default: "team" } }],
    [{ scope: { default: "individual", allow: [] } }],
    [{ scope: { default: "individual", allow: ["individual", "individual"] } }],
    [{ scope: { default: "individual", extra: 1 } }],
    [{ individualAcross: "everywhere" }],
    [{ owner: "organization" }],
  ])("rejects %j", (ownership) => {
    expect(validate({ ownership }).valid).toBe(false);
  });

  it("accepts the membership flags the user block carries (ADR-056 §3.6)", () => {
    expect(validate({ user: { strictMembership: true } }).valid).toBe(true);
    expect(validate({ user: { strictUserValidation: true } }).valid).toBe(true);
    expect(validate({ user: { strictMembership: "yes" } }).valid).toBe(false);
  });
});

describe("integration-definition schema: ownership and binding scope", () => {
  const definition = (extra) => ({
    name: "sync",
    version: "1.0.0",
    modules: { crm: { definition: { moduleName: "hubspot" } } },
    ...extra,
  });

  it("accepts ownership.scope and ownership.owner", () => {
    expect(
      validateIntegrationDefinition(
        definition({ ownership: { scope: "organization", owner: "derive" } })
      ).valid
    ).toBe(true);
    expect(validateIntegrationDefinition(definition({ ownership: { owner: "organization" } })).valid).toBe(true);
  });

  it.each([[{ owner: "team" }], [{ scope: "team" }], [{ other: 1 }]])(
    "rejects ownership %j",
    (ownership) => {
      expect(validateIntegrationDefinition(definition({ ownership })).valid).toBe(false);
    }
  );

  it("accepts a scope on a module binding and rejects a bad one", () => {
    const withScope = (scope) =>
      definition({ modules: { crm: { definition: { moduleName: "hubspot" }, scope } } });
    expect(validateIntegrationDefinition(withScope("individual")).valid).toBe(true);
    expect(
      validateIntegrationDefinition(withScope({ default: "individual", allow: ["individual", "organization"] })).valid
    ).toBe(true);
    expect(validateIntegrationDefinition(withScope("team")).valid).toBe(false);
  });
});
