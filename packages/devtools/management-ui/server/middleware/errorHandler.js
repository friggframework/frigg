import { createErrorResponse, ERROR_CODES } from '../utils/response.js'

/**
 * Enhanced error handler middleware that creates standardized error responses
 * @param {Error} err - The error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
    console.error('API Error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Default error response
    let status = 500;
    let code = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Internal Server Error';
    let details = null;

    // Handle specific error types
    if (err.code === 'ENOENT') {
        status = 404;
        code = ERROR_CODES.NOT_FOUND;
        message = 'File or resource not found';
    } else if (err.code === 'EACCES') {
        status = 403;
        code = ERROR_CODES.FORBIDDEN;
        message = 'Permission denied';
    } else if (err.name === 'ValidationError') {
        status = 400;
        code = ERROR_CODES.INVALID_REQUEST;
        message = err.message;
    } else if (err.status && err.code) {
        // Custom application errors
        status = err.status;
        code = err.code;
        message = err.message;
        details = err.details;
    } else if (err.status || err.statusCode) {
        status = err.status || err.statusCode;
        message = err.message;
    }

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
        details = {
            ...details,
            stack: err.stack
        };
    }

    const errorResponse = createErrorResponse(code, message, details);
    res.status(status).json(errorResponse);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export { errorHandler, asyncHandler };
