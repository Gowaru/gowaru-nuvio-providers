import { extractStreams } from './extractor.js';
import { createProvider, createSettingsLayout } from '../utils/resolvers.js';
import { TIMEOUTS } from './config.js';

module.exports = {
    getStreams: createProvider('Webflix', extractStreams, { timeout: TIMEOUTS.PROVIDER }),
    // UI de réglages — NuvioMobile uniquement (NuvioTV ignore le hook mais
    // injecte quand même SCRAPER_SETTINGS si sauvegardés ailleurs)
    onSettings: createSettingsLayout([
        { type: 'header', label: 'Préférences Webflix' },
        {
            type: 'select',
            key: 'language',
            label: 'Langue préférée',
            description: "Ne résout que les sources de la langue choisie quand c'est possible",
            defaultValue: 'all',
            options: [
                { label: 'Tout (VF + VOSTFR)', value: 'all' },
                { label: "VF d'abord (filtre VOSTFR)", value: 'vf' },
                { label: 'VOSTFR d\'abord (filtre VF)', value: 'vostfr' },
            ],
        },
        {
            type: 'text',
            key: 'excludeHosts',
            label: 'Hosts exclus',
            description: "Noms séparés par des virgules, ex: uqload, multiup. Laisser vide pour tout garder.",
            placeholder: 'uqload, multiup',
        },
        { type: 'info', label: "Astuce : exclure un host accélère la résolution (moins de timeouts)." },
    ]),
};
