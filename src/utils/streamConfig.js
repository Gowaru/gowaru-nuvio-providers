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
    return {
        preferredQuality: config.preferredQuality || process.env.PREFERRED_QUALITY || null,
        preferredLanguage: config.preferredLanguage || process.env.PREFERRED_LANGUAGE || null,
        preferredFormats: config.preferredFormats || (process.env.PREFERRED_FORMATS ? process.env.PREFERRED_FORMATS.split(',') : DEFAULTS.preferredFormats),
        maxStreams: config.maxStreams != null ? config.maxStreams : (process.env.MAX_STREAMS ? parseInt(process.env.MAX_STREAMS, 10) : DEFAULTS.maxStreams),
        strictMode: config.strictMode ?? (process.env.STRICT_MODE === 'true') ?? DEFAULTS.strictMode,
    };
}

export function resetConfig() { config = { ...DEFAULTS }; }
