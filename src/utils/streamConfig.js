const DEFAULTS = {
    preferredQuality: null,
    preferredLanguage: null,
    preferredFormats: ['m3u8', 'mp4', 'mkv'],
    maxStreams: 10,
    strictMode: false,
};

let config = { ...DEFAULTS };

export function configure(options = {}) {
    for (const key of Object.keys(DEFAULTS)) {
        if (options[key] !== undefined) config[key] = options[key];
    }
}

export function getConfig() {
    return { ...config };
}

export function resetConfig() { config = { ...DEFAULTS }; }
