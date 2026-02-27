const fs = require('fs');

const filePath = 'src/voiranime/extractor.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldFind = `    for (const slug of allSlugs) {
        const url = \`\${BASE_URL}/anime/\${slug}/\`;
        try {
            await fetchText(url, { method: 'HEAD' });
            console.log(\`[VoirAnime] Predicted slug found: \${slug}\`);
            return [{ title: title, url: url }];
        } catch (e) { /* Predict failed */ }
    }`;

const newFind = `    const validPredictions = [];
    for (const slug of allSlugs) {
        const url = \`\${BASE_URL}/anime/\${slug}/\`;
        try {
            await fetchText(url, { method: 'HEAD' });
            console.log(\`[VoirAnime] Predicted slug found: \${slug}\`);
            validPredictions.push({ title: title + (slug.includes('vostfr') ? ' VOSTFR' : (slug.includes('vf') ? ' VF' : '')), url: url });
        } catch (e) { /* Predict failed */ }
    }
    
    if (validPredictions.length > 0) return validPredictions;`;

if (content.includes(oldFind)) {
    content = content.replace(oldFind, newFind);
    fs.writeFileSync(filePath, content);
    console.log("Fixed VoirAnime slug early exit");
}
