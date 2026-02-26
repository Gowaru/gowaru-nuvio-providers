const { resolveStream } = require('./src/utils/resolvers.js');

async function test() {
    const stream = await resolveStream({
        name: 'Test',
        title: 'Sibnet',
        url: 'https://video.sibnet.ru/shell.php?videoid=4665161',
        quality: 'HD',
        headers: { 'Referer': 'https://animevostfr.org/' }
    });
    console.log(stream);
}
test();
