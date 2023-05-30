
if (process.env.NODE_ENV !== 'production') {
    // Load values from .env
    require('dotenv').config();
}

const apiModule = {
    name: 'microsoft-sharepoint',
    label: 'Microsoft SharePoint',
    productUrl: 'https://microsoft.com/sharepoint',
    apiDocs: 'https://developer.microsoft.com/en-us/graph/graph-explorer',
    logoUrl: 'https://friggframework.org/assets/img/microsoft-sharepoint.jpeg',
    categories: ['Sharing'],
    description: 'SharePoint is a web-based collaborative platform that integrates natively with Microsoft 365 (previously, Microsoft Office)'
};

const sharepoint = {
    clientId: process.env.SHAREPOINT_CLIENT_ID,
    clientSecret:  process.env.SHAREPOINT_CLIENT_SECRET,
    redirectUri: process.env.SHAREPOINT_REDIRECT_URI,
    scope: process.env.SHAREPOINT_SCOPE
};

const mongoUri = process.env.MONGO_URI;

module.exports = {
  apiModule,
  sharepoint,
  mongoUri
};
