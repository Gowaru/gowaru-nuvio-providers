export const CONFIG = {
  BASE_URL: 'https://www.dulourd.hair',
  TIMEOUTS: {
    HEAD: 10000,
    PAGE: 20000,
    API: 15000,
    GLOBAL: 90000,
  },
  ENDPOINTS: {
    seasonApi: '/engine/inc/serial/app/ajax/Season.php',
  },
  GENRES: [
    'action_s', 'animation_s', 'aventure_s', 'comedie_s',
    'documentaire-s', 'drame_s', 'famille-s', 'fantastique_s',
    'guerre_s', 'historique_s', 'horreur_s', 'judiciare_s',
    'musical_s', 'policier_s', 'romance_s', 'science-fiction_s',
    'thriller_s', 'western_s',
  ],
  SERVER_LABELS: {
    voe: 'VOE',
    filemoon: 'Filemoon',
    doodstream: 'Doodstream',
    uqload: 'Uqload',
    vidoza: 'Vidoza',
    netu: 'Netu',
  },
  LANGUAGE_MAP: {
    vf: 'VF',
    vostfr: 'VOSTFR',
  },
  MAX_SEARCH_QUERIES: 5,
};
