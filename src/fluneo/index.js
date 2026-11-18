import { extractStreams } from './extractor.js';
import { createProvider, createSettingsLayout } from '../utils/resolvers.js';

module.exports = {
  getStreams: createProvider('Fluneo', extractStreams),
  // UI de réglages — NuvioMobile. Le cookie est le SEUL moyen de passer le
  // challenge Cloudflare managé du site (client HTTP non-navigateur).
  onSettings: createSettingsLayout([
    { type: 'header', label: 'Fluneo' },
    {
      type: 'info',
      label: "myfluneo.eu est protégé par Cloudflare : sans cookie, les pages sont refusées (0 flux). Copiez le cookie cf_clearance depuis votre navigateur (même Wi-Fi que l'appareil).",
    },
    {
      type: 'text',
      key: 'cfClearance',
      label: 'Cookie cf_clearance',
      description: "Valeur du cookie cf_clearance (ou la ligne Cookie complète). Expire au bout de quelques heures.",
      placeholder: 'cf_clearance=...',
      isPassword: true,
    },
    {
      type: 'text',
      key: 'userAgent',
      label: 'User-Agent du navigateur',
      description: "À renseigner si Cloudflare refuse le cookie : doit être EXACTEMENT le même UA que le navigateur qui a obtenu le cookie.",
      placeholder: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    },
    {
      type: 'select',
      key: 'language',
      label: 'Langue',
      description: 'Limite les sources à une version quand elle existe.',
      defaultValue: 'all',
      options: [
        { label: 'Tout (VF + VOSTFR)', value: 'all' },
        { label: 'VF uniquement', value: 'vf' },
        { label: 'VOSTFR uniquement', value: 'vostfr' },
      ],
    },
    { type: 'info', label: "Astuce : le cookie se renouvelle en rechargeant le site dans le navigateur." },
  ]),
};
