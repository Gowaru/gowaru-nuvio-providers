const { resolveStream } = require('./src/utils/resolvers.js');

async function test() {
    const stream = await resolveStream({
        name: 'Test',
        title: 'Sibnet',
        url: 'https://video.sibnet.ru/shell.php?videoid=3071549',
        quality: 'HD',
        headers: { 'Referer': 'https://vostfree.ws/' }
    });
    console.log(stream);
}
test();
