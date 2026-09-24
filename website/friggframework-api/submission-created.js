const fetch = require('node-fetch')
exports.handler = async function (event, context, callback) {
    const payload = JSON.parse(event.body).payload
    console.log(JSON.parse(event.body))
    console.log(payload)
    console.log(payload.data["slack-invite"])
    const email = payload.data.email
    const slackInvite = !!payload.data["slack-invite"]
    const emailUpdates = !!payload.data["update-emails"]
    console.log(email, slackInvite, emailUpdates)
    const res = await fetch('https://api.friggframework.org/subscribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify({email, slackInvite, emailUpdates})
    })
    console.log(res)
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'processed' })
    }
}
