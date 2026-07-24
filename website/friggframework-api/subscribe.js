const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept',
}


exports.handler = async function (event, context, callback) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
        }
    }
    const payload = JSON.parse(event.body);
    const email = encodeURIComponent(payload.email.trim());
    const SLACK_TOKEN = process.env.SLACK_TOKEN;
    const SLACK_CHANNEL = process.env.SLACK_CONNECT_CHANNEL_ID;
    const SLACK_INVITE_ENDPOINT = 'https://slack.com/api/conversations.inviteShared';
    const toSlack = `emails=${email}&channel=${SLACK_CHANNEL}`;
    let isError = false;
    let responseMessage = [];
    if (!payload.slackInvite && !payload.emailUpdates) responseMessage.push('No opt-ins provided')
    if (payload.slackInvite) {
        try {
            const res = await fetch(`${SLACK_INVITE_ENDPOINT}?${toSlack}`,
                {
                    headers:
                        {'Authorization': `Bearer ${SLACK_TOKEN}`}
                }
                )
            .then((res) => res.json())
            if (!res.ok) {
                console.log(res)
                isError = true
            } else {
                responseMessage.push('Invited to Slack')
            }

        } catch (e) {
            console.log(e)
            isError = true
        }
    }

    // Always send to Zapier
    try {
        const res = await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify({email: payload.email.trim(),
            slackInvite: payload.slackInvite,
            emailUpdates: payload.emailUpdates}),
            contentType: 'application/json'
        })
        responseMessage.push('Email subscribed')
    } catch (e) {
        console.log(e)
        isError = true

    }



    return callback(null, {
        statusCode: isError ? 400 : 200,
        headers: {
            ...CORS_HEADERS,
            "content-type": 'application/json'
        },
        body: JSON.stringify({
            message: isError ? 'error' : responseMessage.join(', ')
        })
    });


}

