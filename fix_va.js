const fs = require('fs');

const filePath = 'src/voiranime/extractor.js';
let content = fs.readFileSync(filePath, 'utf8');

const s1Logic = `        // Also try with season 1 explicit
        slugCandidates.push(\`\${baseSlug}-1\`, \`\${baseSlug}-1-vostfr\`, \`\${baseSlug}-saison-1\`);`;

const newS1Logic = `        // Also try with season 1 explicit and VF explicit (since some S1 are split logic or VF forced)
        slugCandidates.push(\`\${baseSlug}-1\`, \`\${baseSlug}-1-vostfr\`, \`\${baseSlug}-saison-1\`, \`\${baseSlug}-vf\`, \`\${baseSlug}-1-vf\`);`;

const searchS1Logic = `const seasonSlugs = season === 1
                ? [bs, \`\${bs}-1\`, \`\${bs}-1-vostfr\`]
                : [\`\${bs}-\${season}\`, \`\${bs}-\${season}-vostfr\`, \`\${bs}-\${season}-vf\`, \`\${bs}-saison-\${season}\`];`;

const newSearchS1Logic = `const seasonSlugs = season === 1
                ? [bs, \`\${bs}-vf\`, \`\${bs}-1\`, \`\${bs}-1-vostfr\`, \`\${bs}-1-vf\`]
                : [\`\${bs}-\${season}\`, \`\${bs}-\${season}-vostfr\`, \`\${bs}-\${season}-vf\`, \`\${bs}-saison-\${season}\`];`;

if (content.includes(s1Logic)) {
    content = content.replace(s1Logic, newS1Logic);
    content = content.replace(searchS1Logic, newSearchS1Logic);
    fs.writeFileSync(filePath, content);
    console.log("Fixed VoirAnime S1 VF Slugs");
}
