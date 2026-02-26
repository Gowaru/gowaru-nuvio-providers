const cheerio = require('cheerio-without-node-native');
async function test() {
    const res = await fetch('https://vostfree.ws/150-shingeki-no-kyoujin-saison-1-vf-ddl-streaming-1fichier-uptobox.html');
    const html = await res.text();
    const $ = cheerio.load(html);
    const buttonsId = 'buttons_1';
    const playerElements = $(`#${buttonsId} div[id^="player_"]`).toArray();
    for (const el of playerElements) {
        const playerId = $(el).attr('id').replace('player_', '');
        const playerName = $(el).text().trim() || "Player";
        const contentDivId = `content_player_${playerId}`;
        const content = $(`#${contentDivId}`).text().trim();
        console.log(playerName, "->", content);
    }
}
test();
