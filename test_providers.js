/**
 * Quick integration test for Nuvio providers.
 * Usage: node test_providers.js [provider1 provider2 ...]
 * If no providers specified, tests all.
 *
 * Proxy: set NUVIOPROXY_URL=http://localhost:3001 to route through the Node.js proxy
 */
if (typeof globalThis !== 'undefined' && process.env.NUVIOPROXY_URL) {
    globalThis.__NUVIOPROXY__ = process.env.NUVIOPROXY_URL;
}
const providers = [
    'sekai', 'voiranime', 'voiranime-homes', 'voiranime-rip', 'vostfree',
    'animevostfr', 'anime-sama', 'animesama-co', 'animesultra', 'animoflix',
    'french-anime', 'frenchstream', 'french-manga', 'movix', 'mugiwarastream',
    'dulourd', 'wookafr', 'flemmix', 'coflix', 'anime-ultime', 'waveanime',
    'papadustream', 'nakios', 'streamzo', 'otakufr'
];

const testCases = [
    { tmdbId: 1429, mediaType: 'tv', season: 1, episode: 1, label: 'AOT S1E1' },
    { tmdbId: 1429, mediaType: 'tv', season: 4, episode: 28, label: 'AOT S4E28 (final)' },
    { tmdbId: 95479, mediaType: 'tv', season: 1, episode: 1, label: 'Jujutsu Kaisen S1E1' },
    { tmdbId: 65930, mediaType: 'tv', season: 1, episode: 1, label: 'My Hero Academia S1E1' },
    { tmdbId: 85937, mediaType: 'tv', season: 1, episode: 1, label: 'Demon Slayer S1E1' },
    // Anime non licenciés : cas de validation réels pour anime-ultime
    // (AOT/JJK/MHA/Demon Slayer sont licenciés sur ce site → 0 stream attendu)
    { tmdbId: 2661, mediaType: 'tv', season: 1, episode: 1, label: 'Kamen Rider S1E1' },
    { tmdbId: 9148, mediaType: 'tv', season: 1, episode: 1, label: 'Great Mazinger S1E1' },
    { tmdbId: 35753, mediaType: 'tv', season: 2, episode: 1, label: 'Zero no Tsukaima S2E1' },
    // Cas de validation waveanime (présents sur le site, format DASH)
    // NB: AOT S1E1 déjà couvert par le cas AOT S1E1 ci-dessus (le site le
    // référence en format 'kai', accepté par le provider waveanime)
    { tmdbId: 209867, mediaType: 'tv', season: 1, episode: 1, label: 'Frieren S1E1 (kai)' },
    { tmdbId: 810693, mediaType: 'movie', label: 'Jujutsu Kaisen 0 (waveanime)' },
    // ── Verrou anti fan-edit ──────────────────────────────────────────────────
    // La requête 'Naruto' (S1, 2002) doit matcher la série Naruto (TMDB 46260),
    // PAS la fan-edit 'Naruto Shippuden Kai (2025)' ni la suite 'Naruto Shippuden'
    // (TMDB 31910) — bug corrigé sur animevostfr/french-manga/voiranime-homes et
    // flemmix/wookafr/frenchstream/coflix (pénalité countExtraWords dans le scoring).
    // L'assertion associée (tmdbId 46260) est dans la boucle de test ci-dessous.
    { tmdbId: 46260, mediaType: 'tv', season: 1, episode: 1, label: 'Naruto S1E1 (anti fan-edit)' },
    { tmdbId: 129, mediaType: 'movie', label: 'Spirited Away' },
    { tmdbId: 372058, mediaType: 'movie', label: 'Your Name' },
    { tmdbId: 916224, mediaType: 'movie', label: 'Suzume' },
    { tmdbId: 1402, mediaType: 'tv', season: 1, episode: 1, label: 'The Walking Dead S1E1' },
    { tmdbId: 1416, mediaType: 'tv', season: 1, episode: 1, label: 'Grey\'s Anatomy S1E1' },
    { tmdbId: 60625, mediaType: 'tv', season: 1, episode: 1, label: 'Rick et Morty S1E1' },
];

async function main() {
    const args = process.argv.slice(2);
    const toTest = args.length > 0 ? args.filter(p => providers.includes(p)) : providers;

    console.log(`Testing ${toTest.length} providers against ${testCases.length} test cases\n`);

    for (const name of toTest) {
        let mod;
        try {
            mod = require(`./providers/${name}.js`);
        } catch (e) {
            console.log(`[${name}] FAILED TO LOAD: ${e.message}`);
            continue;
        }

        if (typeof mod.getStreams !== 'function') {
            console.log(`[${name}] NO getStreams EXPORT`);
            continue;
        }

        for (const tc of testCases) {
            const start = Date.now();
            try {
                const streams = await mod.getStreams(tc.tmdbId, tc.mediaType, tc.season, tc.episode);
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                const direct = streams.filter(s => s && s.isDirect).length;
                const total = streams.length;
                console.log(`[${name}] ${tc.label}: ${total} streams (${direct} direct) in ${elapsed}s`);
                if (streams.length > 0) {
                    const first = streams[0];
                    console.log(`         first: ${first.name} | ${first.title} | ${first.quality} | ${(first.url || '').slice(0, 80)}`);
                }
                if (streams.length > 1) {
                    const last = streams[streams.length - 1];
                    console.log(`         last:  ${last.name} | ${last.title} | ${last.quality} | ${(last.url || '').slice(0, 80)}`);
                }

                // Verrou anti fan-edit : les streams de Naruto S1 (TMDB 46260)
                // ne doivent JAMAIS pointer vers la fan-edit 'Naruto Shippuden Kai'
                // ni la suite 'Naruto Shippuden' — sinon le matching a régressé.
                if (tc.tmdbId === 46260 && streams.length > 0) {
                    const bad = streams.some(s => /shippuden/i.test(`${s.title || ''} ${s.url || ''}`));
                    if (bad) {
                        console.log(`[${name}] ⚠️ NARUTO LOCK VIOLATION: streams pointent vers Naruto Shippuden (fan-edit/suite)`);
                    }
                }
            } catch (e) {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                console.log(`[${name}] ${tc.label}: ERROR after ${elapsed}s: ${e.message}`);
            }
        }
        console.log('');
    }
}

main().catch(console.error);
