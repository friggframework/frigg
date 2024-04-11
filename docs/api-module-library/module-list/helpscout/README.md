# Help Scout

This API Module allows your app to connect to the Help Scout [Mailbox API](https://developer.helpscout.com/mailbox-api/).

### Supported Functionality

* Resource Owner
  * `getUserDetails()`: Gets the resource owner details (/me endpoint)
* Conversations
  * `listConversations()`: Gets the paginated list of conversations
* Customers
  * `listCustomers()`: Gets the paginated list of customers
  * `createCustomer(body)`: Creates a customer
  * `deleteCustomer(id)`: Deletes a customer by ID
* Mailboxes
  * `listMailboxes()`: Gets the paginated list of mailboxes

Please note the Api Module doesn't do any data manipulations. Please refer to the [official documentation](https://developer.helpscout.com/mailbox-api/endpoints/conversations/list/) to look at the exact data shapes.

Looking for more? We love contributions!

* [Here](https://developer.helpscout.com/mailbox-api/endpoints/conversations/list/) you can find the official list of endpoints.
* [Here](https://github.com/friggframework/frigg/blob/v1-alpha/docs/api-module-library/module-list/helpscout/api-module-library/helpscout/README.md) you can find instructions for setting up the integration locally in order to make contributions to the project.
