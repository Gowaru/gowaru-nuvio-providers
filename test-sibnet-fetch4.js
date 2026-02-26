async function test() {
    const res = await fetch('https://video.sibnet.ru/shell.php?videoid=3071549', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Referer': 'https://video.sibnet.ru/'
        }
    });
    const text = await res.text();
    console.log(text.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/));
}
test();
