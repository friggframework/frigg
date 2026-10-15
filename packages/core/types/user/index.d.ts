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
    /** Default `org_role`. Exposed as `User#getOrgRole()`; stored on a new membership. */
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
    /**
     * Refuse (400) a request whose person is not a member of the organization it
     * names, instead of adding the membership. Applies to `x-frigg` headers.
     */
    strictMembership?: boolean;
    /** Alias of `strictMembership`; `strictMembership` wins when both are set. */
    strictUserValidation?: boolean;
    authModes?: UserAuthModes;
    jwtConfig?: AdopterJwtConfig;
  }

  /**
   * One person's membership of one organization (ADR-056 §3.6). `implicit` is
   * true when it is only the legacy `IndividualUser.organizationId` pointer.
   */
  export interface OrganizationMembership {
    id: string | null;
    individualUserId: string;
    organizationUserId: string;
    role: string | null;
    createdAt?: Date;
    implicit: boolean;
  }

  export interface OrganizationMembershipRepository {
    findMembership(
      individualUserId: string,
      organizationUserId: string
    ): Promise<OrganizationMembership | null>;
    /** Idempotent: adds when absent, never changes an existing membership. */
    addMembership(
      individualUserId: string,
      organizationUserId: string,
      options?: { role?: string | null }
    ): Promise<OrganizationMembership>;
    listMembershipsForIndividual(
      individualUserId: string
    ): Promise<OrganizationMembership[]>;
  }

  export function createOrganizationMembershipRepository(): OrganizationMembershipRepository;

  export class User {
    /** The primary user's id; under `primary: 'organization'` the ACTIVE organization. */
    getId(): string | undefined;
    /** The organization this request acts in (token or `x-frigg-apporgid`), or null. */
    getActiveOrganizationId(): string | null;
    getAppUserId(): string | null;
    getAppOrgId(): string | null;
    getIndividualUser(): any;
    getOrganizationUser(): any;
    getPrimaryUser(): any;
    /** The organization role from the adopter token for this request, or null. */
    getOrgRole(): string | null;
    setOrgRole(orgRole: string | null): void;
  }
}
