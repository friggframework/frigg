const { createHandler } = require('./createHandler');

const CrossbeamPollWorker = require('../workers/queues/CrossbeamPollWorker');

module.exports.crossbeamPollWorker = createHandler({
    eventName: 'Crossbeam Poll Worker',
    isUserFacingResponse: false,
    method: async (event) => {
        const lhWorker = new CrossbeamPollWorker();
        await lhWorker.run(event);
        return {
            message: 'Successfully processed the Crossbeam Poll Worker',
            input: event,
        };
    },
});
