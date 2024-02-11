# Help Scout

This is the API Module for Help Scout that allows the [Frigg](https://friggframework.org) code to talk to the Help Scout Mailbox API.

Read more on the [Frigg documentation site](https://docs.friggframework.org/api-modules/list/helpscout

### Repo instructions

```
npm install
```

### Working with the integration

Please add a `.env` file in this same folder, that includes the following entries:

```
HELPSCOUT_CLIENT_ID=your app client id
HELPSCOUT_CLIENT_SECRET=your app secret
REDIRECT_URI=http://localhost:3000/redirect
MONGO_URI=your mongodb connection string
```

Please ensure your Help Scout app includes `http://localhost:3000/redirect` as a Redirection URL.

Ready! You should now be able to run tests: `npm run tests`.