# Definition of Terms

**Integration**:\
Extends `@friggframework/integration-base`.\
_Connects (usually 2) modules for the connection of data and actions. Business logic goes here._

**API Module**:\
Composed of an API Class (generally extending a subclass of `@friggframework/requester`) and a Module Definition.\
_The API Class handles the requests to external APIs for authentication, identification, and data retrieval. The Module Definition lets the `@friggframework` know how to use this API Class as an API Module, such that tokens and other metadata for the connection to an external API can be stored (and refreshed)._

**Entity (authorizing entity)**:\
A mongoose model extending `@friggframework/module-plugin/entity`.\
_For a given API Module, the entity is a kind of handle, linking to the relevant credentials, and storing metadata about who/what is authorizing. Retrieving these for a given user is an important gateway to accessing an integration, as most integration actions require one or more authorized API Modules. Most generally, an API Module will be instantiated by passing in an Entity._

**Credential**:\
A mongoose model extending `@friggframework/module-plugin/credential`.\
_For a given API Module, the credential generally stores the tokens or data necessary for making authenticated requests. Multiple Entities can reference the same credential, although 1:1:1 User:Entity:Credential is common._
