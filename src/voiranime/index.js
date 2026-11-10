import { extractStreams } from './extractor.js';
import { createProvider } from '../utils/resolvers.js';

// timeout 48 s : la chaîne VoirAnime est la plus coûteuse du repo (fiche
// ~250 Ko + 4 lecteurs à collecter/resoudre par langue, VOSTFR ET VF). Le
// budget interne du provider reste borné à 40 s ; la marge sert à ce qu'un
// ralentissement réseau ne fasse pas jeter des streams déjà résolus.
module.exports = { getStreams: createProvider('VoirAnime', extractStreams, { timeout: 48000, quality: { includeCodec: true, includeFps: true } }) };
