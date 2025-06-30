const chalk = require('chalk');
const https = require('https');
const { version: currentVersion } = require('../../package.json');

let hasCheckedUpdate = false;

async function checkForUpdates(silent = false) {
    if (hasCheckedUpdate) return;
    hasCheckedUpdate = true;
    
    return new Promise((resolve) => {
        const options = {
            hostname: 'registry.npmjs.org',
            port: 443,
            path: '/@friggframework/cli',
            method: 'GET',
            timeout: 3000
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const packageInfo = JSON.parse(data);
                    const latestVersion = packageInfo['dist-tags']?.latest;
                    
                    if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                        if (!silent) {
                            console.log();
                            console.log(chalk.yellow('  ⚡ Update available: ') + 
                                chalk.gray(currentVersion) + ' → ' + chalk.green(latestVersion));
                            console.log(chalk.gray('  Run ') + chalk.cyan('npm update -g @friggframework/cli') + 
                                chalk.gray(' to update'));
                            console.log();
                        }
                    }
                } catch (e) {
                    // Silently fail - don't disrupt user experience
                }
                resolve();
            });
        });
        
        req.on('error', () => {
            // Silently fail - don't disrupt user experience
            resolve();
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve();
        });
        
        req.end();
    });
}

function isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
        if (latestParts[i] > currentParts[i]) return true;
        if (latestParts[i] < currentParts[i]) return false;
    }
    
    return false;
}

// Check for updates in the background after a small delay
function scheduleUpdateCheck() {
    setTimeout(() => {
        checkForUpdates(true);
    }, 1000);
}

module.exports = {
    checkForUpdates,
    scheduleUpdateCheck
};