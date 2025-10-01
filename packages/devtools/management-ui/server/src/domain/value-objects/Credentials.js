/**
 * Credentials Value Object
 * Securely represents authentication credentials
 */
export class Credentials {
  constructor({ accessToken, refreshToken, expiresAt, apiKey, clientId, clientSecret } = {}) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.expiresAt = expiresAt ? new Date(expiresAt) : null
    this.apiKey = apiKey
    this.clientId = clientId
    this.clientSecret = clientSecret
    Object.freeze(this)
  }

  isExpired() {
    if (!this.expiresAt) return false
    return new Date() >= this.expiresAt
  }

  hasRefreshToken() {
    return !!this.refreshToken
  }

  hasApiKey() {
    return !!this.apiKey
  }

  isOAuth() {
    return !!this.accessToken
  }

  canRefresh() {
    return this.hasRefreshToken() && this.isExpired()
  }

  toSecureJSON() {
    // Return credentials with sensitive data masked
    return {
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      hasApiKey: !!this.apiKey,
      expiresAt: this.expiresAt?.toISOString(),
      isExpired: this.isExpired()
    }
  }

  // Factory method to create from OAuth response
  static fromOAuthResponse({ access_token, refresh_token, expires_in }) {
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null

    return new Credentials({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt
    })
  }

  // Factory method to create from API key
  static fromApiKey(apiKey) {
    return new Credentials({ apiKey })
  }
}