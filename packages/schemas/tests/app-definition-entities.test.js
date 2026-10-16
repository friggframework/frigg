const { validateAppDefinition } = require("../index");

const baseDefinition = {
  name: "test-app",
  provider: "aws",
  integrations: [],
};

const validate = (entities) =>
  validateAppDefinition({ ...baseDefinition, entities });

const hubspot = { definition: { moduleName: "hubspot" } };

describe("app-definition schema: entities (ADR-059)", () => {
  it("stays optional: an app with no entities key is valid", () => {
    expect(validateAppDefinition(baseDefinition).valid).toBe(true);
  });

  it("accepts the ADR example", () => {
    expect(
      validate({
        google: { definition: { moduleName: "google" }, scope: "individual" },
        hubspot,
        twilio: { definition: { moduleName: "twilio" }, scope: "global" },
      }).valid
    ).toBe(true);
  });

  it("accepts $infer as a boolean, alongside entries", () => {
    expect(validate({ $infer: false, hubspot }).valid).toBe(true);
    expect(validate({ $infer: true }).valid).toBe(true);
  });

  it.each(["yes", 0, null, {}])(
    "rejects a non-boolean $infer (%p)",
    (value) => {
      expect(validate({ $infer: value, hubspot }).valid).toBe(false);
    }
  );

  it("requires a definition on every entry", () => {
    expect(validate({ hubspot: { scope: "global" } }).valid).toBe(false);
    expect(validate({ hubspot: {} }).valid).toBe(false);
  });

  it("rejects entries that are not objects", () => {
    expect(validate({ hubspot: "hubspot" }).valid).toBe(false);
    expect(validate({ hubspot: null }).valid).toBe(false);
  });

  it("rejects unknown keys on an entry", () => {
    expect(validate({ hubspot: { ...hubspot, alias: "crm" } }).valid).toBe(
      false
    );
  });

  it("rejects entities that is not an object", () => {
    expect(validate([hubspot]).valid).toBe(false);
    expect(validate("hubspot").valid).toBe(false);
  });

  describe("scope", () => {
    it.each(["individual", "organization", "global"])(
      'accepts "%s"',
      (scope) => {
        expect(validate({ hubspot: { ...hubspot, scope } }).valid).toBe(true);
      }
    );

    it("accepts { default, allow }", () => {
      expect(
        validate({
          hubspot: {
            ...hubspot,
            scope: {
              default: "individual",
              allow: ["individual", "organization"],
            },
          },
        }).valid
      ).toBe(true);
    });

    it.each([
      "team",
      "",
      { default: "team" },
      { allow: ["individual", "team"] },
      { allow: [] },
      { allow: ["global", "global"] },
      { default: "global", extra: true },
      7,
    ])("rejects %p", (scope) => {
      expect(validate({ hubspot: { ...hubspot, scope } }).valid).toBe(false);
    });
  });

  it("accepts proxy and display objects and rejects other types", () => {
    expect(
      validate({
        hubspot: {
          ...hubspot,
          proxy: { allow: "module" },
          display: { label: "HubSpot", icon: "hubspot" },
        },
      }).valid
    ).toBe(true);
    expect(validate({ hubspot: { ...hubspot, proxy: "all" } }).valid).toBe(
      false
    );
    expect(
      validate({ hubspot: { ...hubspot, display: "HubSpot" } }).valid
    ).toBe(false);
  });

  it("keeps the top-level additionalProperties policy", () => {
    expect(
      validateAppDefinition({ ...baseDefinition, entitys: {} }).valid
    ).toBe(false);
  });
});
