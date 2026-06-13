import { extractStreams } from './extractor.js';
import { createProvider } from '../utils/resolvers.js';

module.exports = { getStreams: createProvider('AnimesUltra', extractStreams, { quality: { includeCodec: true, includeFps: true } }) };
