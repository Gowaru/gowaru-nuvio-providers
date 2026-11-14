import { extractStreams } from './extractor.js';
import { createProvider } from '../utils/resolvers.js';

// timeout 48 s : la chaîne VoirAnime est la plus coûteuse du repo (fiche
// ~250 Ko + 4 lecteurs à collecter/resoudre par langue, VOSTFR ET VF). Le
// budget interne du provider reste borné à 40 s ; la marge sert à ce qu'un
// ralentissement réseau ne fasse pas jeter des streams déjà résolus.
// `manifestTimeout` 3 s : l'expansion qualité (parse des HLS vmpx.online)
// s'exécute APRÈS la collecte et coûtait jusqu'à 6 s sur un CDN lent, alors
// qu'un manifest qui met > 3 s à répondre ne donnera pas une bonne lecture.
module.exports = { getStreams: createProvider('VoirAnime', extractStreams, { timeout: 48000, quality: { includeCodec: true, includeFps: true, manifestTimeout: 3000 } }) };
