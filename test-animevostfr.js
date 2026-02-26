const { getStreams } = require('./providers/animevostfr.js');

async function test() {
    const streams = await getStreams('1429', 'tv', 1, 1); // Attack on Titan
    console.log(streams);
}
test();
