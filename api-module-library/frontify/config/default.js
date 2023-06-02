
if (process.env.NODE_ENV !== 'production') {
    // Load values from .env
    require('dotenv').config();
}

const meta = {
    name: 'frontify',
    label: 'Frontify',
    productUrl: 'https://frontify.com',
    apiDocs: 'https://developer.frontify.com/d/XFPCrGNrXQQM/graphql-api',
    logoUrl: 'https://friggframework.org/assets/img/frontify.jpeg',
    categories: ['Sharing'],
    description: 'Allow access to Frontify assets from a Canva design'
};

const frontify = {
    clientId: process.env.FRONTIFY_CLIENT_ID,
    clientSecret:  process.env.FRONTIFY_CLIENT_SECRET,
    redirectUri: process.env.FRONTIFY_REDIRECT_URI,
    scope: process.env.FRONTIFY_SCOPE
};

const mongoUri = process.env.MONGO_URI;

module.exports = {
  meta,
  frontify,
  mongoUri
};
