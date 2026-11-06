/**
 * Security middleware to ensure the server is only accessible from localhost
 */
const securityMiddleware = (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Extract the actual IP if it's in IPv6 format
    const actualIp = clientIp.includes('::ffff:') 
        ? clientIp.split('::ffff:')[1] 
        : clientIp;
    
    // Allow only localhost connections
    const allowedIps = ['127.0.0.1', 'localhost', '::1'];
    
    if (!allowedIps.includes(actualIp)) {
        console.warn(`Blocked connection attempt from ${actualIp}`);
        return res.status(403).json({
            error: 'Forbidden',
            message: 'This server is only accessible from localhost'
        });
    }
    
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    next();
};

export { securityMiddleware };