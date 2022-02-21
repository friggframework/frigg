const Boom = require('@hapi/boom');

// CheckLoggedIn Middleware
const requireLoggedInUser = (req, res, next) => {
    if (!req.userManager || !req.userManager.isLoggedIn()) {
        throw Boom.unauthorized('Invalid Token');
    }

    next();
};

module.exports = { requireLoggedInUser };
