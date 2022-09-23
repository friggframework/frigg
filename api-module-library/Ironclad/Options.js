const config = require('../../frigg.config');
const BaseManager = require('../Base/BaseManager');
const Manager = require('./IroncladManager');

const IroncladOptions = {
    module: Manager,
    integrations: [BaseManager],
    display: {
        name: 'Ironclad',
        description: 'Description',
        category: 'Category',
        detailsUrl: 'https://www.example.com/',
        icon: `${config.baseUrl}/assets/img/ironclad.png`,
    },
    hasUserConfig: false
}

module.exports = IroncladOptions;