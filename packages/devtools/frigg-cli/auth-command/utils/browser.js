const { exec } = require('child_process');
const os = require('os');

async function openBrowser(url) {
    const platform = os.platform();
    let command;

    switch (platform) {
        case 'darwin':
            command = `open "${url}"`;
            break;
        case 'win32':
            command = `start "" "${url}"`;
            break;
        default:
            command = `xdg-open "${url}"`;
    }

    return new Promise((resolve, reject) => {
        exec(command, (error) => {
            if (error) {
                reject(new Error(`Failed to open browser: ${error.message}`));
            } else {
                resolve();
            }
        });
    });
}

module.exports = { openBrowser };
