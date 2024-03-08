# encrypt

This package exports the `encrypt` mongoose plugin used in [Frigg](https://friggframework.org). You can find its documentation [on Frigg's website](https://docs.friggframework.org/packages/encrypt).

## Configuration

| Environment variable    | Description                                                                                                |
|-------------------------|------------------------------------------------------------------------------------------------------------|
| KMS_KEY_ARN             | The AWS KMS Key ARN, if using it to encryption/decryption.                                                 |
| AES_KEY                 | AES key, used in conjunction with AES_KEY_ID. AES option is mutually exclusive with KMS_KEY_ARN.           |
| AES_KEY_ID              | AES key ID, used in conjunction with AES_KEY.                                                              |
| STAGE                   | The stage in which the application is running. It is usually defined in Serverless configuration, if used. |
| BYPASS_ENCRYPTION_STAGE | Stages to bypass encryption/decryption, separated by comma.                                                |
