# Core Concepts

Understanding these core concepts will help you get the most out of the Frigg framework:

## Integration

**Extends `@friggframework/integration-base`.**\
An "integration" is how Frigg connects (usually 2) modules for the connection of data and actions. Each service has its own API Module to represent its API to the middleware; use case-specific business logic will also be required.

## API Module

**Composed of an API Class (generally extending a subclass of `@friggframework/requester`) and a Module Definition.**\
The API Class handles the requests to external APIs, i.e. authentication, identification, and data retrieval. The Module Definition lets the @friggframework know how to use this API Class as an API Module, such that tokens and other metadata the connection to an external api, can be stored (and refreshed).

## Entity (authorizing entity)

**A mongoose model extending `@friggframework/module-plugin/entity`:**\
For a given API Module, the entity is a kind of handle, linking to the relevant credentials, and storing metadata about who/what is authorizing. Retrieving these for a given user is an important gateway to accessing an integration, as most integration actions require one or more authorized API Modules. Most generally, an API Module will be instantiated by passing in an Entity.

## Credential

**A mongoose model extending `@friggframework/module-plugin/credential`:**\
For a given API Module, the credential generally stores the tokens or data necessary for making authenticated requests. Multiple Entities can reference the same credential, although 1:1:1 User:Entity:Credential is common.

## Data Handling

Frigg manages data securely and efficiently, ensuring it can scale as needed without compromising performance. The framework includes built-in support for:

- **Encryption**: Automatic KMS integration for field-level encryption
- **Configuration Management**: SSM Parameter Store for secure config and secrets
- **Network Security**: VPC support for network isolation and compliance

## Infrastructure Automation

Frigg provides automatic AWS infrastructure configuration:

- **VPC Configuration**: Automatic VPC setup with AWS Discovery or infrastructure creation
- **Security**: KMS encryption and SSM Parameter Store integration
- **Cost Optimization**: VPC endpoints and intelligent resource discovery
- **Compliance**: Network isolation and encryption for regulated environments

## Customization

Frigg is highly customizable, letting you tailor modules and integrations to fit your specific needs. Infrastructure features can be enabled independently:

```javascript
const appDefinition = {
    integrations: [/* your integrations */],
    vpc: { enable: true },              // Network isolation
    encryption: { useDefaultKMSForFieldLevelEncryption: true }, // Data encryption  
    ssm: { enable: true }               // Configuration management
};
```

## Testing

Frigg supports automated testing with tools like Jest to maintain reliability and performance.

## Contribution

Frigg is open-source and thrives on community contributions. Whether you're fixing bugs, writing documentation, or developing new modules, your input is valuable. We encourage users to get involved through our GitHub repository, participate in discussions, and submit pull requests. Every bit of help makes Frigg better for everyone.
