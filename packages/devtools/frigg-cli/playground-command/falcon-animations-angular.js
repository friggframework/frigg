const chalk = require('chalk');

// Modern angular Frigg falcon frames
const ANGULAR_FALCON_FRAMES = {
    standing: [
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
        `  \\__/\\__/
 /  /\\  \\
<  /  \\  >
 \\/    \\/
  \\    /
   \\  /
    \\/`
    ],
    
    modern: [
        `   ╱╲
  ╱  ╲__
 ╱  ╱╲  ╲
╱__╱  ╲__╲
  ╲  ╱╲  ╱
   ╲╱  ╲╱`
    ],
    
    stylized: [
        `    △
   /|\\
  / | \\
 /  |  \\
<   |   >
 \\  |  /
  \\ | /
   \\|/
    ▽`
    ],
    
    geometric: [
        `   ▲
  ╱ ╲
 ╱   ╲
◀     ▶
 ╲   ╱
  ╲ ╱
   ▼`
    ],
    
    // ASCII art approximation of the SVG layers
    layered: [
        `     /\\
    /  \\___
   /  /\\   \\
  /  /  \\   \\
 /  /    \\   \\
/__/      \\__\\
  \\   /\\   /
   \\ /  \\ /
    V    V`
    ]
};

// Export for use in playground
module.exports = {
    ANGULAR_FALCON_FRAMES
};