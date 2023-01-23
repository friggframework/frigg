# How to create your own api module

NOTE: For these docs, my module is called `listrak`

## Step 1: Copy an existing module

NOTE: in the future, we would like to have code generation for this but for now, I had to copy from an existing module

`cp api-module-library/gorgias api-module-library/listrak`

## Step 2: rename all files and instances of gorgias to 'listrak'

NOTE: make sure to search and replace with case sensitive search in your IDE

- File names
- Configuration (GORGIAS)
- Classes (Gorgias)
- Variables (gorgias)

# Which methods should you thouch?

## Step 3: Update the Api.js file

Set the authorization urls from the api docs that you want to access
```
//api-module-library/listrak/api.js
this.authorizationUri = encodeURI(`???`);
this.tokenUri = `https://${this.subdomain}/OAuth2/Token`;
```

Set the Urls for all routes you want to be able to call after authorization is complete

```
//api-module-library/listrak/api.js
this.URLs = {
```
## Step 3.5: Update the manager class



## Step 4: Update the configuration

This file should have meaningful values `api-module-library/listrak/defaultConfig.json`

# Questions

1. What are the tests required to prove that a module works?
2. Does this need to be tested from within a create frigg app?
3. What parts of the code that I have now should not be in the module?
4. I need help to go through every method and add comments to it.
5. What is jsonSchema and how is it used?
6. What is uiSchema and how is it used?
7. "We should ask them to provide a “connectionName”… which can be the store name, some sort of unique identifier of the listrak account." - What does this mean and how does it relate to this task?
8. "externalId and name for Entity should be the passed in connectionName… or externalId can concatenation of name + userId" - What does this mean?

