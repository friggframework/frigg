const { FriggManagementServer } = require('../../management-ui/server');
const open = require('open');
const chalk = require('chalk');

async function uiCommand(options) {
    const { port = 3001, open: shouldOpen = true } = options;
    
    console.log(chalk.blue('Starting Frigg Management UI...'));
    
    try {
        // Create and start the server
        const server = new FriggManagementServer({ port });
        await server.start();
        
        console.log(chalk.green(`✓ Management UI server running on http://localhost:${port}`));
        console.log(chalk.gray('Press Ctrl+C to stop the server'));
        
        // Open browser if requested
        if (shouldOpen) {
            console.log(chalk.blue('Opening browser...'));
            setTimeout(() => {
                open(`http://localhost:${port}`);
            }, 1000);
        }
        
        // Keep the process running
        process.stdin.resume();
        
    } catch (error) {
        console.error(chalk.red('Failed to start Management UI:'), error.message);
        process.exit(1);
    }
}

module.exports = { uiCommand };