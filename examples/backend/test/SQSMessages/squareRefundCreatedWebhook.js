module.exports = {
    Records: [
        {
            messageId: 'daac3381-dcd5-43a9-b7c7-23967ac59d96',
            receiptHandle:
                'AQEBvceDdvh8ImIOrLLtZQVdZlfpY6jTeKJ0DBLg/UF9zPIcrWH1d8HbkruRt4ruFP1ulLHDUsJqqYyPx/ljUTvvZOWuLggDtGUWWukRlh4aB319PGHfVEEZ4J0Y/1XKNNaHd97hCFu9L/jF4H7Cb6DxwEY16rCKOX8v3h79AgUUMe80TOl9cbIk952yNGQ5rXe3bmRnXkDj7nnjdxdpOJ6X0minLHmg9VLYs8vX/cR5CzZMwCoMcNEWyPCWML+2S4z1GQBDhpjppv46eld3JDLDc0PtEK8Qsui2Tj701pmxugOlLZRUH3n7RHsuSiNZ1vAweX8GhzF8BsYU6ZPparC8fw+ObZQWTXUN7ad+Z3rSSpMFPhrXEzTgOXc63Vxrkjl71DVIHvZuzjiaCAJUU4HpZA==',
            body: '{"integration_id":"square","obj":{"merchant_id":"S2TQ6G39YWFXD","type":"refund.updated","event_id":"abdf18c0-0e56-4dd5-8fec-105aa964104c","created_at":"2020-05-01T17:03:11.054Z","data":{"type":"refund","id":"T1oV2ABpNGd4UbCcXmOPhfIWmqLZY_D3py8c33OjxP66fhv82fChRRyvOHDmiJ1o4kcoHoEVF","object":{"refund":{"amount_money":{"amount":34,"currency":"USD"},"created_at":"2020-05-01T17:03:05.094Z","id":"T1oV2ABpNGd4UbCcXmOPhfIWmqLZY_D3py8c33OjxP66fhv82fChRRyvOHDmiJ1o4kcoHoEVF","location_id":"JK61C4XEWE0F7","order_id":"wjysxtEVkv8xMg6jNPt4Q8lH0SPZY","payment_id":"T1oV2ABpNGd4UbCcXmOPhfIWmqLZY","processing_fee":[{"amount_money":{"amount":-1,"currency":"USD"},"effective_at":"2020-05-01T19:02:55.000Z","type":"INITIAL"}],"status":"COMPLETED","updated_at":"2020-05-01T17:03:07.105Z","version":7}}}}}',
            attributes: [Object],
            messageAttributes: {},
            md5OfBody: '28506cac2cba7d1dc88c89ee43cb7a4c',
            eventSource: 'aws:sqs',
            eventSourceARN:
                'arn:aws:sqs:us-east-1:757210591029:dev-OngoingSyncWorker',
            awsRegion: 'us-east-1',
        },
    ],
};
