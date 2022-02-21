const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/me', (req, res, next) => {
	res.json({
		message: 'GET /me',
		endpoint: 'https://api.attentivemobile.com/v1/me',
	});
});

// var axios = require('axios');
// var qs = require('qs');
// var data = qs.stringify({
//   'grant_type': 'authorization_code',
//   'code': 'MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3',
//   'redirect_uri': 'https://test.com',
//   'client_id': '9f7a2f11a4f849f59268869ec766111c',
//   'client_secret': '0FvaRpPi5KBC4Izj9ALA0AG8J2WdcBhU'
// });
// var config = {
//   method: 'post',
//   url: 'https://api.attentivemobile.com/v1/authorization-codes/tokens',
//   headers: { },
//   data : data
// };

// axios(config)
// .then(function (response) {
//   console.log(JSON.stringify(response.data));
// })
// .catch(function (error) {
//   console.log(error);
// });
router.post('/access-token', (req, res, next) => {
	res.json({
		message: 'POST /access-token',
		endpoint: 'https://api.attentivemobile.com/v1/authorization-codes/tokens',
	});
});

// SUBSCRIPTIONS
//
//
// GET Get subscription eligibility for a user
// https://api.attentivemobile.com/v1/subscriptions?phone=+13115552368&email=test@gmail.com
// URL Params; Phone, Email
router
	.route('/subscriptions')
	.get((req, res, next) => {})

	// POST Subscribe User
	// https://api.attentivemobile.com/v1/subscriptions
	//
	// var data = {
	//     "user": {
	//         "phone": "+13115552368",
	//         "email": "test@gmail.com"
	//     },
	//     "signUpSourceId":
	//     "reprehenderit eu Lorem commodo"
	// };

	// var config = {
	//   method: 'post',
	//   url: 'https://api.attentivemobile.com/v1/subscriptions',
	//   headers: {
	//     'Authorization': '<token>'
	//   },
	//   data : data
	// };

	.post((req, res, next) => {});

// POST Unsubscribe subscriptions for a user
// https://api.attentivemobile.com/v1/subscriptions/unsubscribe

// var data = {
//     "user": {
//         "phone": "+13115552368",
//         "email": "test@gmail.com"
//     },
//     "subscriptions": [
//         {
//             "type": "CHECKOUT_ABANDONED",
//             "channel": "EMAIL"
//         },
//         {
//             "type": "TRANSACTIONAL",
//             "channel": "TEXT"
//         }
//     ],
//     "notification": {
//         "language": "in culpa deserunt"
//     }
// };

// var config = {
//   method: 'post',
//   url: 'https://api.attentivemobile.com/v1/subscriptions/unsubscribe',
//   headers: {
//     'Authorization': '<token>'
//   },
//   data : data
// };

// axios(config)
// .then(function (response) {
//   console.log(JSON.stringify(response.data));
// })
// .catch(function (error) {
//   console.log(error);
// });

router.post('/subscriptions/unsubscribe', (req, res, next) => {
	res.json({
		message: 'POST /subscriptions/unsubscribe',
		endpoint: 'https://api.attentivemobile.com/v1/subscriptions/unsubscribe',
	});
});
