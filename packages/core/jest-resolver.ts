const path = require('node:path');

interface ResolverOptions {
    defaultResolver: (request: string, options: ResolverOptions) => string;
    rootDir?: string;
    basedir: string;
}

module.exports = (request: string, options: ResolverOptions): string => {
    const { defaultResolver } = options;
    try {
        return defaultResolver(request, options);
    } catch (error: unknown) {
        if (
            error instanceof Error &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
            !request.startsWith('@') &&
            !path.isAbsolute(request)
        ) {
            const rootDir = options.rootDir || path.resolve(__dirname);
            const resolved = path.resolve(options.basedir, request);
            const relative = path.relative(rootDir, resolved);

            if (relative && !relative.startsWith('..') && !relative.startsWith('node_modules')) {
                const distPath = path.join(rootDir, 'dist', relative);
                try {
                    return defaultResolver(distPath, { ...options, basedir: rootDir });
                } catch {
                    // fall through to original error
                }
            }
        }
        throw error;
    }
};
