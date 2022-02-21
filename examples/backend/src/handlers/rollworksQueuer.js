const { createHandler } = require('./createHandler');

const RollWorksQueuer = require('../workers/crons/RollWorksQueuer');

module.exports.handler = createHandler({
    eventName: 'RollWorks Queuer',
    isUserFacingResponse: false,
    method: async (event) => {
        const lhWorker = new RollWorksQueuer();
        await lhWorker._run();
        return {
            message: 'Successfully Started the RollWorks Queuer',
            input: event,
        };
    },
});
