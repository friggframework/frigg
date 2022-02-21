const catchAsyncError = require('express-async-handler');
const UserManager = require('../../managers/UserManager');

module.exports = catchAsyncError(async (req, res, next) => {
    const authorizationHeader = req.headers.authorization;

    if (authorizationHeader) {
        // Removes "Bearer " and trims
        const token = authorizationHeader.split(' ')[1].trim();
        // Load user for later middleware/routes to use
        req.userManager = await new UserManager({ token });
    }

    return next();
});
