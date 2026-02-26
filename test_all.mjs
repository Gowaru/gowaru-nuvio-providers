// Test all providers locally with AoT S1E1
const providers = ['anime-sama', 'voiranime', 'vostfree', 'animevostfr', 'french-anime'];
const TMDB_ID = '1429'; // Attack on Titan
const MEDIA_TYPE = 'tv';
const SEASON = 1;
const EPISODE = 1;

for (const name of providers) {
  try {
    const mod = await import(`./providers/${name}.js`);
    const fn = mod.getStreams || mod.default?.getStreams;
    if (!fn) { console.log(`[${name}] NO getStreams export`); continue; }
    
    console.log(`\n======= Testing ${name} =======`);
    const start = Date.now();
    const streams = await Promise.race([
      fn(TMDB_ID, MEDIA_TYPE, SEASON, EPISODE),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT 30s')), 30000))
    ]);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${name}] RESULT: ${streams?.length ?? 'null'} streams in ${elapsed}s`);
    if (streams?.length > 0) {
      streams.slice(0,2).forEach(s => console.log(`  - ${s.name} | ${s.title} | isDirect:${s.isDirect} | ${s.url?.substring(0,60)}`));
    }
  } catch (e) {
    console.log(`[${name}] ERROR: ${e.message}`);
  }
}
