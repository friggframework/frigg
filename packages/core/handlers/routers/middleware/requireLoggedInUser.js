const Boom = require('@hapi/boom');

/**
 * Require logged in user middleware
 * Ensures req.user was successfully loaded by loadUser middleware
 *
 * Uses DDD pattern: Middleware checks domain entity existence
 * req.user is populated by loadUser middleware using GetUserFromBearerToken use case
 */
const requireLoggedInUser = (req, res, next) => {
    // Check if user was successfully loaded by loadUser middleware
    if (!req.user || !req.user.getId()) {
        throw Boom.unauthorized('Invalid Token');
    }

    next();
};

module.exports = { requireLoggedInUser };
