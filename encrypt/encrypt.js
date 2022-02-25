// const AWS = require('aws-sdk');
const crypto = require("crypto");
const aes = require("./aes");

const algorithm = "aes-256-ctr";

// const awsconfig = {
//     accessKey: '<Your AWS Access Key>',
//     secretAccessKey: '<Your AWS Secret Key>',
//     region: '<Your AWS region>',
//     cmkArn: '<Your KMS master Key arn >', // The identifier of the CMK to use to encrypt the data key. You can use the key ID or Amazon Resource Name (ARN) of the CMK, or the name or ARN of an alias that refers to the CMK.
// };
//
// // Creates the KMS client
// function getKMSClient() {
//     const credentials = new AWS.Credentials(awsconfig.accessKey, awsconfig.secretAccessKey);
//     AWS.config.update({
//         region: awsconfig.region,
//         credentials,
//     });
//
//     return new AWS.KMS();
// }

// Below are the replacement functions in lieu of using AWS KMS
function generateDataKey() {
  const { AES_KEY_ID } = process.env;
  const { AES_KEY } = process.env;
  // Random key generation
  const randomKey = crypto.randomBytes(32).toString("hex").slice(0, 32);
  return {
    KeyId: AES_KEY_ID,
    CiphertextBlob: aes.encrypt(randomKey, AES_KEY),
    Plaintext: randomKey,
  };
}
// Decrypt the KMS Data key
function decryptDataKey(CiphertextBlob, KeyId) {
  const availableKeys = {
    [process.env.AES_KEY_ID]: process.env.AES_KEY,
    [process.env.DEPRECATED_AES_KEY_ID]: process.env.DEPRECATED_AES_KEY,
  };
  const encryptedKey = availableKeys[KeyId];
  if (!encryptedKey) {
    console.log("No Encryption Key Found, returning raw string value.");
    return "No Encryption Key Found";
  }

  return {
    KeyId,
    Plaintext: aes.decrypt(CiphertextBlob, encryptedKey),
  };
}

module.exports = {
  encrypt(text) {
    if (["QA", "prod", "encryption-test"].indexOf(process.env.STAGE) > -1) {
      const dataKey = generateDataKey();
      const encryptedKey = dataKey.CiphertextBlob;
      const encryptedText = aes.encrypt(text, dataKey.Plaintext);
      // Concatenate the encrypted to the buffer and return the base64 string
      return `${dataKey.KeyId}:${encryptedText}:${encryptedKey}`;
    }
    return text;
  },

  decrypt(text) {
    if (["QA", "prod", "encryption-test"].indexOf(process.env.STAGE) > -1) {
      try {
        // Convert the base64 string to buffer
        const split = text.split(":");
        const KeyId = split[0];
        const encryptedKey = `${split[3]}:${split[4]}`;
        const encryptedText = `${split[1]}:${split[2]}`;
        const dataKey = decryptDataKey(encryptedKey, KeyId);
        if (dataKey === "No Encryption Key Found") return text;
        const decrypted = aes.decrypt(encryptedText, dataKey.Plaintext);
        return decrypted;
      } catch (err) {
        console.log("Error decrypting");
        throw new Error(err);
      }
    }
    return text;
  },
};
