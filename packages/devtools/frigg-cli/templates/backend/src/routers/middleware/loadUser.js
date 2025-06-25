const catchAsyncError = require('express-async-handler');
const {User} = require('../../../backend');

module.exports = catchAsyncError(async (req, res, next) => {
    const authorizationHeader = req.headers.authorization;

    if (authorizationHeader) {
        // Removes "Bearer " and trims
        const token = authorizationHeader.split(' ')[1].trim();
        // Load user for later middleware/routes to use
        req.user = await User.newUser({ token });
    }

    return next();
});
