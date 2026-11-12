import { extractStreams } from './extractor.js';
import { createProvider, createSettingsLayout } from '../utils/resolvers.js';

module.exports = {
    getStreams: createProvider('Coflix', extractStreams),
    // UI de réglages — NuvioMobile uniquement (NuvioTV ignore le hook mais
    // injecte quand même SCRAPER_SETTINGS si sauvegardés ailleurs).
    onSettings: createSettingsLayout([
        { type: 'header', label: 'Préférences Coflix' },
        {
            type: 'toggle',
            key: 'turnstileEnabled',
            label: 'Activer le solveur Turnstile',
            description: "Les lecteurs DoodStream/Playmogo sont protégés par Cloudflare Turnstile. Nécessite une clé API.",
            defaultValue: false,
        },
        {
            type: 'select',
            key: 'turnstileService',
            label: 'Service de résolution',
            description: "Utilisé uniquement si le solveur est activé.",
            defaultValue: 'capsolver',
            options: [
                { label: 'CapSolver', value: 'capsolver' },
                { label: '2Captcha', value: '2captcha' },
            ],
        },
        {
            type: 'text',
            key: 'turnstileApiKey',
            label: 'Clé API du solveur',
            description: "Clé de votre compte CapSolver/2Captcha. Stockée par l'app, jamais embarquée dans le provider.",
            placeholder: 'CAP-xxxxxxxx',
            isPassword: true,
        },
        { type: 'info', label: "Désactivé par défaut : sans clé, les lecteurs protégés sont simplement écartés au profit des autres." },
    ]),
};
