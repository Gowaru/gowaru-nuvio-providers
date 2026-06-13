import { extractStreams } from './extractor.js';
import { createProvider } from '../utils/resolvers.js';

module.exports = { getStreams: createProvider('VoirAnime', extractStreams, { quality: { includeCodec: true, includeFps: true } }) };
