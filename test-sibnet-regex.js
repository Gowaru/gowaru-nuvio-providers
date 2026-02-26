const fs = require('fs');
const html = fs.readFileSync('sibnet3.html', 'utf8');
const match = html.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
              html.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
              html.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
console.log("Match:", match);
