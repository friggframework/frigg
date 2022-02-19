const nforce = require('nforce');
const { opportunityPushTopicName } = require('../../constants/StringConstants');
// All the authenication is part of the configuration for a Connected App in Salesforce

// consumerKey 3MVG9JEx.BE6yifNujwiP1J0_D6wmZhOtfCns9rCjTMvnlzHfpmbyd5wDTzerxNIOOB8ojv0jxdDwZYTsteJy
// consumer secret 737FBEAE5D1F202FE32552A03949F5AF6BA21D4DE44E83C95E5FE59CD9808CBC
const org = nforce.createConnection({
    clientId:
        '3MVG9JEx.BE6yifNujwiP1J0_D6wmZhOtfCns9rCjTMvnlzHfpmbyd5wDTzerxNIOOB8ojv0jxdDwZYTsteJy',
    clientSecret:
        '737FBEAE5D1F202FE32552A03949F5AF6BA21D4DE44E83C95E5FE59CD9808CBC',
    redirectUri: 'http://localhost:3000/oauth/callback',
    // Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
    // Licensed under the Amazon Software License
    // http://aws.amazon.com/asl/
    // environment:'sandbox',
    apiVersion: 'v44.0',
    mode: 'multi', // was single
});
// const TOPIC = '/event/Raz_Test_Event__e';// 'OppCRUD__e';
// const REPLAY_ID = -1;
// const USERNAME = 'ryan@coderden.com.salesrightappdev';
// const PASSWORD = '5688razy';
// SNS TOPIC
// const TOPIC_ARN = 'Opportunity';
// exports.handler = function(event, context, callback) {/**/
// authenticate via oauth process to SFDC
const oauth = {
    access_token:
        '00D3t00000108T1!AQYAQKCQS8FXTdeFcujm714SovEvshEn7V7nyDibNus5JP.47HsUhgR5uaWinmYSRiF37Wc1n1glcPk3AEUWXEByHO1XdULd',
    instance_url: 'https://na123.salesforce.com',
};
const client = org.createStreamClient({ oauth });
const accs = client.subscribe({
    topic: opportunityPushTopicName,
    replayId: -1,
    retry: -1,
    oauth,
});
console.log(
    `Subscription to ${opportunityPushTopicName} supposedly successful for thing`
);
accs.on('error', (err) => {
    console.log(`Error occurred, ${err}`);
    client.disconnect();
});

accs.on('data', (data) => {
    console.log(
        `PushTopic, ${opportunityPushTopicName} detected\nEvent:${JSON.stringify(
            data
        )}`
    );
});
const exiting = () => {
    console.log('Exiting');
};
setTimeout(exiting, 90000);
