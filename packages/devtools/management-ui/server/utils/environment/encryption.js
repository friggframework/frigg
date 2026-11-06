import crypto from 'crypto'

class EnvironmentEncryption {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'aes-256-gcm'
    this.keyLength = options.keyLength || 32
    this.ivLength = options.ivLength || 16
    this.tagLength = options.tagLength || 16
    this.saltLength = options.saltLength || 64
    this.iterations = options.iterations || 100000
    
    // Master key should be stored securely (e.g., environment variable, key management service)
    this.masterKey = this.getMasterKey()
  }

  /**
   * Get or generate master encryption key
   * In production, this should be stored securely (AWS KMS, HashiCorp Vault, etc.)
   */
  getMasterKey() {
    const envKey = process.env.ENCRYPTION_MASTER_KEY
    if (envKey) {
      return Buffer.from(envKey, 'base64')
    }
    
    // For development only - generate a key
    console.warn('No ENCRYPTION_MASTER_KEY found. Generating temporary key for development.')
    return crypto.randomBytes(this.keyLength)
  }

  /**
   * Derive encryption key from master key and salt
   */
  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keyLength, 'sha256')
  }

  /**
   * Encrypt a value
   */
  encrypt(plaintext) {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength)
      const iv = crypto.randomBytes(this.ivLength)
      
      // Derive key from master key and salt
      const key = this.deriveKey(salt)
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv)
      
      // Encrypt the plaintext
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ])
      
      // Get the authentication tag
      const tag = cipher.getAuthTag()
      
      // Combine salt, iv, tag, and encrypted data
      const combined = Buffer.concat([salt, iv, tag, encrypted])
      
      // Return base64 encoded string
      return {
        encrypted: combined.toString('base64'),
        algorithm: this.algorithm,
        isEncrypted: true
      }
    } catch (error) {
      console.error('Encryption error:', error)
      throw new Error('Failed to encrypt value')
    }
  }

  /**
   * Decrypt a value
   */
  decrypt(encryptedData) {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData.encrypted, 'base64')
      
      // Extract components
      const salt = combined.slice(0, this.saltLength)
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength)
      const tag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      )
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength)
      
      // Derive key from master key and salt
      const key = this.deriveKey(salt)
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv)
      decipher.setAuthTag(tag)
      
      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ])
      
      return decrypted.toString('utf8')
    } catch (error) {
      console.error('Decryption error:', error)
      throw new Error('Failed to decrypt value')
    }
  }

  /**
   * Check if a value is encrypted
   */
  isEncrypted(value) {
    if (typeof value === 'object' && value.isEncrypted === true) {
      return true
    }
    
    // Check if string looks like encrypted data (base64 with minimum length)
    if (typeof value === 'string') {
      try {
        const decoded = Buffer.from(value, 'base64')
        return decoded.length >= this.saltLength + this.ivLength + this.tagLength + 16
      } catch {
        return false
      }
    }
    
    return false
  }

  /**
   * Encrypt sensitive environment variables
   */
  encryptVariables(variables, patterns = []) {
    const defaultPatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /private/i,
      /auth/i
    ]
    
    const allPatterns = [...defaultPatterns, ...patterns]
    
    return variables.map(variable => {
      // Check if variable should be encrypted
      const shouldEncrypt = allPatterns.some(pattern => 
        pattern.test(variable.key)
      )
      
      if (shouldEncrypt && variable.value && !this.isEncrypted(variable.value)) {
        const encrypted = this.encrypt(variable.value)
        return {
          ...variable,
          value: encrypted.encrypted,
          encrypted: true,
          algorithm: encrypted.algorithm
        }
      }
      
      return variable
    })
  }

  /**
   * Decrypt variables for use
   */
  decryptVariables(variables) {
    return variables.map(variable => {
      if (variable.encrypted && variable.value) {
        try {
          const decrypted = this.decrypt({
            encrypted: variable.value,
            algorithm: variable.algorithm || this.algorithm
          })
          return {
            ...variable,
            value: decrypted,
            encrypted: false
          }
        } catch (error) {
          console.error(`Failed to decrypt variable ${variable.key}:`, error)
          return variable
        }
      }
      
      return variable
    })
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(variables) {
    // Decrypt all variables with old key
    const decrypted = this.decryptVariables(variables)
    
    // Generate new master key
    this.masterKey = crypto.randomBytes(this.keyLength)
    
    // Re-encrypt with new key
    return this.encryptVariables(decrypted)
  }

  /**
   * Generate encryption key for export
   */
  exportKey() {
    return {
      key: this.masterKey.toString('base64'),
      algorithm: this.algorithm,
      generated: new Date().toISOString()
    }
  }

  /**
   * Import encryption key
   */
  importKey(keyData) {
    if (!keyData.key) {
      throw new Error('Invalid key data')
    }
    
    this.masterKey = Buffer.from(keyData.key, 'base64')
    this.algorithm = keyData.algorithm || this.algorithm
  }
}

// Singleton instance
let encryptionInstance = null

/**
 * Get encryption instance
 */
export function getEncryption(options) {
  if (!encryptionInstance) {
    encryptionInstance = new EnvironmentEncryption(options)
  }
  return encryptionInstance
}

/**
 * Middleware to decrypt variables on read
 */
export function decryptMiddleware(req, res, next) {
  const originalJson = res.json
  
  res.json = function(data) {
    if (data && data.variables && Array.isArray(data.variables)) {
      const encryption = getEncryption()
      data.variables = encryption.decryptVariables(data.variables)
    }
    
    return originalJson.call(this, data)
  }
  
  next()
}

/**
 * Middleware to encrypt variables on write
 */
export function encryptMiddleware(req, res, next) {
  if (req.body && req.body.variables && Array.isArray(req.body.variables)) {
    const encryption = getEncryption()
    req.body.variables = encryption.encryptVariables(req.body.variables)
  }
  
  next()
}

export default EnvironmentEncryption