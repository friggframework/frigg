const fs = require('fs');
const path = require('path');

class FileSystemAdapter {
    fileExists(filePath) {
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            return false;
        }
    }

    readFile(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    resolvePath(...pathSegments) {
        return path.resolve(...pathSegments);
    }
}

module.exports = { FileSystemAdapter };
