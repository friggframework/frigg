declare module "@friggframework/core/user" {
  export type AdopterJwtAlgorithm =
    | "ES256"
    | "ES384"
    | "RS256"
    | "RS384"
    | "RS512"
    | "HS256"
    | "HS384"
    | "HS512";

  /**
   * Verification of tokens issued by the adopter's identity system
   * (`authModes.adopterJwt`, ADR-056 §2). Set exactly one of `jwksUri` or `secret`.
   */
  export interface AdopterJwtConfig {
    /** https URL of the issuer's JWKS (http only for localhost, 127.0.0.0/8, ::1). */
    jwksUri?: string;
    /** Shared HMAC secret for HS* tokens. */
    secret?: string;
    /** Required `iss`. With `jwksUri`, a startup warning is logged when unset. */
    issuer?: string;
    /** Accepted `aud`. Required with `jwksUri`. */
    audience?: string | string[];
    /** Allow-list. Default ES256 and RS256 with `jwksUri`, HS256 with `secret`. */
    algorithms?: AdopterJwtAlgorithm[];
    /** @deprecated Use `algorithms`. Setting both is an error. */
    algorithm?: AdopterJwtAlgorithm;
    /** Skew allowed on `exp` and `nbf`. Default 30. */
    clockToleranceSec?: number;
    /** Default `sub`. */
    userIdClaim?: string;
    /** Default `org_id`. */
    orgIdClaim?: string;
    /** Default `org_role`. Exposed as `User#getOrgRole()`; not stored. */
    roleClaim?: string;
  }

  export interface UserAuthModes {
    friggToken?: boolean;
    sharedSecret?: boolean;
    adopterJwt?: boolean;
  }

  /** The `user` block of the app definition. */
  export interface UserConfig {
    usePassword?: boolean;
    primary?: "individual" | "organization";
    individualUserRequired?: boolean;
    organizationUserRequired?: boolean;
    strictUserValidation?: boolean;
    authModes?: UserAuthModes;
    jwtConfig?: AdopterJwtConfig;
  }

  export class User {
    getId(): string | undefined;
    getAppUserId(): string | null;
    getAppOrgId(): string | null;
    getIndividualUser(): any;
    getOrganizationUser(): any;
    getPrimaryUser(): any;
    /** The organization role from the adopter token, or null. */
    getOrgRole(): string | null;
    setOrgRole(orgRole: string | null): void;
  }
}
