const router = require('express');
const bodyParser = require('body-parser');
const Api = require('./api/bot');
const path = require('path');
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

const server = router();
server.use(bodyParser.json());
server.use(bodyParser.urlencoded());

const apiParams = {
    client_id: process.env.TEAMS_CLIENT_ID,
    client_secret: process.env.TEAMS_CLIENT_SECRET
};
const api = new Api.botApi(apiParams);

server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log(`\n${ server.name } listening to ${ server.url }`);
});

server.post('/api/messages', async (req, res) => {
    // Route received a request to adapter for processing
    await api.receiveActivity(req, res);
});

api.bot.onMessage(async (context, next) => {
    if (context.activity.type === 'message' && context.activity.text === 'hello bot') {
        await context.sendActivity('hello world!');
    }
    await next();
});
