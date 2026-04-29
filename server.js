const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const mimeTypes = {
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.css': 'text/css',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
};

const textTypes = ['application/json', 'application/javascript', 'text/html', 'text/css', 'text/plain'];

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    if (!filePath.startsWith(__dirname)) {
        res.setHeader('Content-Type', 'text/plain');
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    const isText = textTypes.includes(contentType);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.setHeader('Content-Type', 'text/plain');
            if (err.code === 'ENOENT') {
                if (req.url === '/') {
                    res.writeHead(200);
                    res.end('Nuvio Providers Server Running. Access /manifest.json to see the manifest.');
                } else {
                    res.writeHead(404);
                    res.end(`File not found: ${req.url}`);
                }
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(isText ? content.toString('utf-8') : content);
    });
});

server.listen(PORT, HOST, () => {
    const ip = getLocalIp();
    console.log(`\n🚀 Server running at: http://${ip}:${PORT}/`);
    console.log(`📝 Manifest URL:      http://${ip}:${PORT}/manifest.json`);
    console.log(`📡 Listening on:     ${HOST}:${PORT}`);
    console.log('Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});