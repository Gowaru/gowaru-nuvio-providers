import { extractStreams } from './extractor.js';
import { createProvider, createSettingsLayout } from '../utils/resolvers.js';
import { SETTING_ALLOW_BLOCKED_CDN } from './config.js';

module.exports = {
    getStreams: createProvider('VoirAnimeHomes', extractStreams),
    // UI de réglages — NuvioMobile uniquement (NuvioTV ignore le hook mais
    // injecte quand même SCRAPER_SETTINGS si sauvegardés ailleurs).
    onSettings: createSettingsLayout([
        { type: 'header', label: 'Préférences VoirAnime.homes' },
        {
            type: 'toggle',
            key: SETTING_ALLOW_BLOCKED_CDN,
            label: 'Inclure les lecteurs luluvid (CDN tnmr)',
            description: "Ces lecteurs aboutissent sur *.tnmr.org, qui répond 403 dans nos tests (blocage réseau/géo possible). À activer si les flux s'y lancent chez vous.",
            defaultValue: false,
        },
        { type: 'info', label: "Désactivé par défaut : les flux tnmr.org ne démarrent pas dans nos tests, ils sont donc écartés au profit des autres lecteurs." },
    ]),
};
