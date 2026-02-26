async function test() {
    const res = await fetch('https://video.sibnet.ru/shell.php?videoid=3071549', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Referer': 'https://video.sibnet.ru/'
        }
    });
    const text = await res.text();
    const match = text.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
                  text.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
                  text.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
    console.log("Match:", match);
    
    const m3u8 = text.match(/https?:\/\/[^"']+\.m3u8[^"']*/) ||
                 text.match(/https?:\/\/[^"']+\.mp4[^"']*/) ||
                 text.match(/file\s*:\s*["']([^"']+)["']/);
    console.log("Fallback Match:", m3u8);
}
test();
