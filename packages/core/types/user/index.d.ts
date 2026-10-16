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
     * With `x-frigg` headers, refuse (400) to make a person a member of an
     * organization that already existed: anyone not already a member, a
     * brand-new `appUserId` included, is rejected. Naming an organization the
     * request itself creates is still allowed. Default false (a non-member is
     * added).
     */
    strictMembership?: boolean;
    /**
     * @deprecated Alias of `strictMembership`, with the same new meaning (it
     * used to reject a mismatched individual/organization pair). Logs a warning
     * at startup. `strictMembership` wins when both are set.
     */
    strictUserValidation?: boolean;
    /**
     * Roles (the adopter token's role claim) that may manage organization-level
     * things (ADR-056 §3). Default `['ADMIN']`; a token with no role claim is
     * `MEMBER`, never admin; a shared-secret (`x-frigg` header) caller needs no
     * role. Compared case-insensitively. Validated at load.
     */
    orgAdminRoles?: string[];
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
    /** Defaults to `MEMBER`. */
    orgRole: string;
    createdAt?: Date;
    implicit: boolean;
  }

  export interface OrganizationMembershipRepository {
    /** The stored row or null: the legacy `organizationId` pointer is not read here. */
    findMembership(
      individualUserId: string,
      organizationUserId: string
    ): Promise<OrganizationMembership | null>;
    /** Idempotent: adds when absent, never changes an existing membership. */
    addMembership(
      individualUserId: string,
      organizationUserId: string,
      options?: { orgRole?: string | null }
    ): Promise<OrganizationMembership>;
    /** Stored rows only, oldest first; legacy-pointer people are not here. */
    listMembershipsForOrganization(
      organizationUserId: string
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
