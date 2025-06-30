const chalk = require('chalk');

// Falcon frames for animations - Modern angular design
const FALCON_FRAMES = {
    standing: [
        `    /\\
   /  \\__
  /  /\\  \\
 /  /  \\  \\
/__/    \\__\\
  \\  /\\  /
   \\/  \\/`,
        `    /\\
   /  \\__
  /  /\\  \\
 /  /  \\  \\
/__/    \\__\\
  \\  /\\  /
   \\/  \\/`
    ],
    flying: [
        `   ___/\\___
  /   /\\   \\
 <   /  \\   >
  \\_/    \\_/
    \\    /
     \\  /
      \\/`,
        ` \\___/\\___/
  \\  /\\  /
   </  \\>
   /    \\
  /  /\\  \\
 /  /  \\  \\
/__/    \\__\\`,
        `  ___/\\___
 /   /\\   \\
<   /  \\   >
 \\_/    \\_/
   \\    /
    \\  /
     \\/`,
        `/\\___/\\___/\\
 \\  /\\  /
  </  \\>
  /    \\
 /  /\\  \\
/__/  \\__\\`
    ],
    walking: [
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
 / |    | \\
   /\\  /\\`,
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
 / |    | \\
   \\/  \\/`
    ],
    pecking: [
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^`,
        `     
    (o o)
   (  V  )___
  /|-=--|/
 / |    | 
   ^^  ^^`,
        `     
    
   (o o)
  /(  V  )___
 / |-=--|/
   |    |
   ^^  ^^`
    ],
    dancing: [
        `     ___
    (o o)
   (  V  )
  \\|-=--|/
 \\ |    | /
   ^^  ^^`,
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
 / |    | \\
  ^^    ^^`,
        `     ___
    (^ ^)
   (  V  )
  \\|-=--|/
   |    |
   /\\  /\\`,
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
   |    |
  ^^    ^^`
    ],
    sleeping: [
        `     ___
    (- -)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^
      z`,
        `     ___
    (- -)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^
     z Z`,
        `     ___
    (- -)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^
    z Z z`
    ],
    winking: [
        `     ___
    (o o)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^`,
        `     ___
    (- o)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^`
    ],
    happy: [
        `     ___
    (^ ^)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^
    ♪ ♫`
    ],
    surprised: [
        `     ___
    (O O)
   (  V  )
  /|-=--|\\
 / |    | \\
   ^^  ^^
      !`
    ],
    matrix: [
        `     ₀₁₁
    (0 1)
   (  V  )
  /|10110|\\
 / |01101| \\
   01  10`,
        `     101
    (1 0)
   (  V  )
  /|01001|\\
 / |10110| \\
   10  01`
    ]
};

// Color themes
const THEMES = {
    default: (text) => chalk.cyan(text),
    fire: (text) => chalk.red(text),
    ice: (text) => chalk.blue(text),
    nature: (text) => chalk.green(text),
    royal: (text) => chalk.magenta(text),
    golden: (text) => chalk.yellow(text),
    rainbow: (text) => {
        const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
        return text.split('').map((char, i) => 
            chalk[colors[i % colors.length]](char)
        ).join('');
    },
    matrix: (text) => chalk.green(text),
    neon: (text) => chalk.hex('#ff00ff')(text)
};

// Animation functions
function clearScreen() {
    process.stdout.write('\x1Bc');
}

function moveCursor(x, y) {
    process.stdout.write(`\x1B[${y};${x}H`);
}

function hideCursor() {
    process.stdout.write('\x1B[?25l');
}

function showCursor() {
    process.stdout.write('\x1B[?25h');
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function animate(frames, options = {}) {
    const {
        duration = 2000,
        loop = false,
        theme = 'default',
        clearBefore = true,
        x = 0,
        y = 0
    } = options;

    const frameTime = duration / frames.length;
    const colorize = THEMES[theme] || THEMES.default;

    hideCursor();
    
    do {
        for (const frame of frames) {
            if (clearBefore) clearScreen();
            moveCursor(x, y);
            
            const lines = frame.split('\n');
            lines.forEach((line, i) => {
                moveCursor(x, y + i);
                process.stdout.write(colorize(line));
            });
            
            await sleep(frameTime);
        }
    } while (loop);
    
    showCursor();
}

async function flyAcrossScreen(options = {}) {
    const {
        theme = 'default',
        speed = 50
    } = options;
    
    const colorize = THEMES[theme] || THEMES.default;
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    
    hideCursor();
    clearScreen();
    
    const birdFrames = FALCON_FRAMES.flying;
    let x = -20;
    let y = Math.floor(height / 2) - 4;
    let frameIndex = 0;
    
    while (x < width + 10) {
        clearScreen();
        
        const frame = birdFrames[frameIndex % birdFrames.length];
        const lines = frame.split('\n');
        
        lines.forEach((line, i) => {
            if (x > 0 && x < width - line.length) {
                moveCursor(x, y + i);
                process.stdout.write(colorize(line));
            }
        });
        
        x += 2;
        frameIndex++;
        await sleep(speed);
    }
    
    showCursor();
}

async function rain(options = {}) {
    const {
        duration = 5000,
        theme = 'matrix'
    } = options;
    
    const colorize = THEMES[theme] || THEMES.default;
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    
    hideCursor();
    clearScreen();
    
    // Display falcon in center
    const falcon = FALCON_FRAMES.standing[0];
    const falconLines = falcon.split('\n');
    const falconX = Math.floor((width - 15) / 2);
    const falconY = Math.floor((height - falconLines.length) / 2);
    
    const drops = [];
    const chars = '01';
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
        clearScreen();
        
        // Draw falcon
        falconLines.forEach((line, i) => {
            moveCursor(falconX, falconY + i);
            process.stdout.write(colorize(line));
        });
        
        // Add new drops
        if (Math.random() > 0.7) {
            drops.push({
                x: Math.floor(Math.random() * width),
                y: 0,
                char: chars[Math.floor(Math.random() * chars.length)]
            });
        }
        
        // Update and draw drops
        for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
            
            moveCursor(drop.x, drop.y);
            process.stdout.write(chalk.green(drop.char));
            
            drop.y++;
            
            if (drop.y >= height) {
                drops.splice(i, 1);
            }
        }
        
        await sleep(100);
    }
    
    showCursor();
}

module.exports = {
    FALCON_FRAMES,
    THEMES,
    animate,
    flyAcrossScreen,
    rain,
    clearScreen,
    showCursor,
    hideCursor
};