import { extractStreams } from './extractor.js';
import { createProvider } from '../utils/resolvers.js';

module.exports = { getStreams: createProvider('AnimeUltime', extractStreams, { quality: { includeCodec: true } }) };
