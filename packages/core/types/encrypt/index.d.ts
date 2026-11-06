declare module "@friggframework/encrypt" {
  export class Cryptor {
    constructor(params: { shouldUseAws?: boolean });
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertext: string): Promise<string>;
  }
}
