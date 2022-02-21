const stage = process.env.NODE_ENV || 'dev';

const jsonConfig = require(`./src/configs/${stage}.json`);

for (key in jsonConfig) {
    process.env[key] = [jsonConfig[key]];
}
