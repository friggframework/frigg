# microsoft-teams

This is the API Module for Microsoft Teams that allows the [Frigg](https://friggframework.org) code to talk to the Microsoft Teams API via Graph API and Bot Framework API.

Read more on the [Frigg documentation site](https://docs.friggframework.org/api-modules/list/microsoft-teams

## Useful links

How auth works - https://learn.microsoft.com/en-us/graph/auth-v2-service

All the routes you can call - https://developer.microsoft.com/en-us/graph/graph-explorer

Azure registered apps that can access teams - https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps

## Sample Auth project that works

https://github.com/Azure-Samples/ms-identity-node

## Bot Server 

The router.sample.js shows how the bot can be invoked standalone (use ngrok to handle the incoming requests). With the server running, interactivity can be tested locally. 
