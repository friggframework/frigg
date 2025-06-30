const chalk = require('chalk');
const readline = require('readline');
const {
    FALCON_FRAMES,
    THEMES,
    animate,
    flyAcrossScreen,
    rain,
    clearScreen,
    showCursor,
    hideCursor
} = require('./falcon-animations');

async function playgroundCommand(options) {
    const { animation, theme = 'default', list } = options;
    
    if (list) {
        listAnimations();
        return;
    }
    
    if (animation) {
        await runAnimation(animation, { theme });
        return;
    }
    
    // Interactive mode
    await interactivePlayground();
}

function listAnimations() {
    console.log(chalk.bold.cyan('\n🎨 Available Animations:\n'));
    
    const animations = [
        ['standing', 'Classic standing falcon'],
        ['flying', 'Falcon in flight'],
        ['walking', 'Walking animation'],
        ['pecking', 'Pecking for food'],
        ['dancing', 'Happy dancing falcon'],
        ['sleeping', 'Sleepy falcon with Z\'s'],
        ['winking', 'Cheeky winking falcon'],
        ['happy', 'Joyful falcon with music notes'],
        ['surprised', 'Surprised falcon'],
        ['matrix', 'Matrix-style digital falcon'],
        ['fly-across', 'Falcon flies across the screen'],
        ['rain', 'Matrix rain with falcon']
    ];
    
    animations.forEach(([name, desc]) => {
        console.log(`  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(desc)}`);
    });
    
    console.log(chalk.bold.cyan('\n🎨 Available Themes:\n'));
    
    const themes = [
        ['default', 'Classic cyan'],
        ['fire', 'Fiery red'],
        ['ice', 'Cool blue'],
        ['nature', 'Natural green'],
        ['royal', 'Royal purple'],
        ['golden', 'Golden yellow'],
        ['rainbow', 'Rainbow colors'],
        ['matrix', 'Matrix green'],
        ['neon', 'Neon pink']
    ];
    
    themes.forEach(([name, desc]) => {
        console.log(`  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(desc)}`);
    });
    
    console.log(chalk.gray('\nUsage: frigg playground --animation <name> --theme <theme>'));
    console.log(chalk.gray('Or just: frigg playground (for interactive mode)\n'));
}

async function runAnimation(animationName, options = {}) {
    const { theme = 'default' } = options;
    
    switch (animationName) {
        case 'standing':
            await animate(FALCON_FRAMES.standing, { theme, loop: true, duration: 1000 });
            break;
        case 'flying':
            await animate(FALCON_FRAMES.flying, { theme, loop: true, duration: 1500 });
            break;
        case 'walking':
            await animate(FALCON_FRAMES.walking, { theme, loop: true, duration: 800 });
            break;
        case 'pecking':
            await animate(FALCON_FRAMES.pecking, { theme, loop: true, duration: 1200 });
            break;
        case 'dancing':
            await animate(FALCON_FRAMES.dancing, { theme, loop: true, duration: 2000 });
            break;
        case 'sleeping':
            await animate(FALCON_FRAMES.sleeping, { theme, loop: true, duration: 3000 });
            break;
        case 'winking':
            await animate(FALCON_FRAMES.winking, { theme, loop: true, duration: 1000 });
            break;
        case 'happy':
            await animate(FALCON_FRAMES.happy, { theme, duration: 2000 });
            break;
        case 'surprised':
            await animate(FALCON_FRAMES.surprised, { theme, duration: 2000 });
            break;
        case 'matrix':
            await animate(FALCON_FRAMES.matrix, { theme: 'matrix', loop: true, duration: 500 });
            break;
        case 'fly-across':
            await flyAcrossScreen({ theme });
            break;
        case 'rain':
            await rain({ theme, duration: 5000 });
            break;
        default:
            console.log(chalk.red(`Unknown animation: ${animationName}`));
            console.log(chalk.gray('Run "frigg playground --list" to see available animations'));
    }
}

async function interactivePlayground() {
    clearScreen();
    console.log(chalk.bold.cyan('🎮 Frigg Falcon Playground\n'));
    console.log(chalk.gray('Interactive mode - Use keyboard to control:\n'));
    
    const controls = [
        ['1-9', 'Switch animations'],
        ['t', 'Change theme'],
        ['f', 'Fly across screen'],
        ['r', 'Matrix rain'],
        ['q', 'Quit']
    ];
    
    controls.forEach(([key, desc]) => {
        console.log(`  ${chalk.cyan(key.padEnd(5))} ${chalk.gray(desc)}`);
    });
    
    console.log(chalk.gray('\nPress any key to start...'));
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    // Setup raw mode for single keypress
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    
    let currentAnimation = 'standing';
    let currentTheme = 'default';
    let animationInterval = null;
    let themeIndex = 0;
    const themeNames = Object.keys(THEMES);
    
    const animations = ['standing', 'flying', 'walking', 'pecking', 'dancing', 
                       'sleeping', 'winking', 'happy', 'surprised', 'matrix'];
    
    function stopCurrentAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }
    
    async function startAnimation(name) {
        stopCurrentAnimation();
        currentAnimation = name;
        
        clearScreen();
        console.log(chalk.gray(`Animation: ${name} | Theme: ${currentTheme} | Press 'q' to quit`));
        
        const frames = FALCON_FRAMES[name] || FALCON_FRAMES.standing;
        let frameIndex = 0;
        
        animationInterval = setInterval(() => {
            const frame = frames[frameIndex % frames.length];
            const colorize = THEMES[currentTheme] || THEMES.default;
            
            process.stdout.write('\x1B[2;0H'); // Move to line 2
            process.stdout.write('\x1B[J'); // Clear from cursor down
            
            const lines = frame.split('\n');
            lines.forEach((line) => {
                console.log(colorize(line));
            });
            
            frameIndex++;
        }, 200);
    }
    
    // Start with standing animation
    await startAnimation('standing');
    
    process.stdin.on('keypress', async (str, key) => {
        if (key && key.name === 'q') {
            stopCurrentAnimation();
            showCursor();
            rl.close();
            process.exit(0);
        }
        
        if (key && key.name === 't') {
            themeIndex = (themeIndex + 1) % themeNames.length;
            currentTheme = themeNames[themeIndex];
            await startAnimation(currentAnimation);
        }
        
        if (key && key.name === 'f') {
            stopCurrentAnimation();
            await flyAcrossScreen({ theme: currentTheme });
            await startAnimation(currentAnimation);
        }
        
        if (key && key.name === 'r') {
            stopCurrentAnimation();
            await rain({ theme: currentTheme, duration: 3000 });
            await startAnimation(currentAnimation);
        }
        
        if (str && str >= '1' && str <= '9') {
            const index = parseInt(str) - 1;
            if (index < animations.length) {
                await startAnimation(animations[index]);
            }
        }
    });
}

module.exports = { playgroundCommand };