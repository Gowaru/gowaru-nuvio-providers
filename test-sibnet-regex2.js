const fs = require('fs');
const html = fs.readFileSync('sibnet3.html', 'utf8');
const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) ||
             html.match(/https?:\/\/[^"']+\.mp4[^"']*/) ||
             html.match(/file\s*:\s*["']([^"']+)["']/);
console.log("Fallback Match:", m3u8);
