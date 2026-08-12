// Shared appearance presets and apply functions used by both App.jsx (startup) and Settings.jsx (live preview)

export const DEFAULT_BACKGROUND = 'linear-gradient(-45deg, #0350a2, #23a6d5, #23d5ab, #0350a2)';

export const BACKGROUND_PRESETS = [
    { name: 'Gradient — Ocean Default', value: DEFAULT_BACKGROUND, kind: 'gradient' },
    { name: 'Gradient — Spotify Green', value: 'linear-gradient(-45deg, #1db954, #1ed760, #1db954, #191414)', kind: 'gradient' },
    { name: 'Gradient — Deep Purple', value: 'linear-gradient(-45deg, #2e0249, #570a57, #a91079, #2e0249)', kind: 'gradient' },
    { name: 'Gradient — Midnight Blue', value: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #0f0c29)', kind: 'gradient' },
    { name: 'Gradient — Ocean Wave', value: 'linear-gradient(-45deg, #2193b0, #6dd5ed, #2193b0, #6dd5ed)', kind: 'gradient' },
    { name: 'Gradient — Forest Green', value: 'linear-gradient(-45deg, #11998e, #38ef7d, #11998e, #38ef7d)', kind: 'gradient' },
    { name: 'Gradient — Cosmic Neon', value: 'linear-gradient(-45deg, #833ab4, #fd1d1d, #fcb045, #833ab4)', kind: 'gradient' },
    { name: 'Gradient — Lava Flow', value: 'linear-gradient(-45deg, #b22222, #ff0000, #800000, #b22222)', kind: 'gradient' },
    { name: 'Gradient — Sunset Vibes', value: 'linear-gradient(-45deg, #ff512f, #dd2476, #ff512f, #dd2476)', kind: 'gradient' },
    { name: 'Gradient — Midnight City', value: 'linear-gradient(-45deg, #232526, #414345, #232526, #414345)', kind: 'gradient' },
    { name: 'Gradient — Cyberpunk', value: 'linear-gradient(-45deg, #ff00ff, #00ffff, #ff00ff, #00ffff)', kind: 'gradient' },
    { name: 'Solid — Charcoal', value: '#121212', kind: 'solid' },
    { name: 'Solid — Slate', value: '#172033', kind: 'solid' },
    { name: 'Solid — Deep Navy', value: '#081426', kind: 'solid' },
    { name: 'Solid — Aubergine', value: '#24112f', kind: 'solid' },
    { name: 'Solid — Forest', value: '#0d241b', kind: 'solid' },
];

export function getBackgroundKind(background) {
    const preset = BACKGROUND_PRESETS.find(option => option.value === background);
    if (preset) return preset.kind;
    return /(?:linear|radial|conic)-gradient\s*\(/i.test(background || '') ? 'gradient' : 'solid';
}

export function applyBackground({ background = DEFAULT_BACKGROUND, imageUrl = '', dim = 0 } = {}) {
    const bodyStyle = document.body.style;
    const normalizedImageUrl = imageUrl.trim();
    const kind = normalizedImageUrl ? 'image' : getBackgroundKind(background);
    const canDim = kind === 'image' || kind === 'solid';

    if (kind === 'image') {
        bodyStyle.background = `url(${normalizedImageUrl}) center / cover fixed`;
        bodyStyle.animation = 'none';
    } else {
        bodyStyle.background = '';
        document.documentElement.style.setProperty('--app-background', background || DEFAULT_BACKGROUND);
        bodyStyle.backgroundSize = kind === 'gradient' ? '400% 400%' : 'auto';
        bodyStyle.animation = kind === 'gradient' ? '' : 'none';
    }

    bodyStyle.setProperty('--bg-dim', canDim ? String(dim) : '0');
    return kind;
}

export const ACCENT_PRESETS = [
    { id: 'teal',   label: 'Teal',   hex: '#14b8a6', bright: '#2dd4bf', r: 20,  g: 184, b: 166 },
    { id: 'purple', label: 'Purple', hex: '#a855f7', bright: '#c084fc', r: 168, g: 85,  b: 247 },
    { id: 'rose',   label: 'Rose',   hex: '#f43f5e', bright: '#fb7185', r: 244, g: 63,  b: 94  },
    { id: 'amber',  label: 'Amber',  hex: '#f59e0b', bright: '#fbbf24', r: 245, g: 158, b: 11  },
    { id: 'sky',    label: 'Sky',    hex: '#0ea5e9', bright: '#38bdf8', r: 14,  g: 165, b: 233 },
    { id: 'green',  label: 'Green',  hex: '#22c55e', bright: '#4ade80', r: 34,  g: 197, b: 94  },
    { id: 'orange', label: 'Orange', hex: '#f97316', bright: '#fb923c', r: 249, g: 115, b: 22  },
];

export const SPEED_OPTIONS = [
    { id: 'instant', label: 'Instant', fast: '0s',    base: '0.05s', slow: '0.1s',  fadeDur: '0s',   staggerDelay: 0     },
    { id: 'normal',  label: 'Normal',  fast: '0.2s',  base: '0.3s',  slow: '0.5s',  fadeDur: '0.5s', staggerDelay: 0.04  },
    { id: 'relaxed', label: 'Relaxed', fast: '0.35s', base: '0.55s', slow: '0.85s', fadeDur: '0.8s', staggerDelay: 0.07  },
];

export function applyAccent(presetId) {
    const preset = ACCENT_PRESETS.find(p => p.id === presetId) ?? ACCENT_PRESETS[0];
    const { r, g, b, hex, bright } = preset;
    const root = document.documentElement.style;
    root.setProperty('--tf-accent',        hex);
    root.setProperty('--tf-accent-bright', bright);
    root.setProperty('--tf-accent-soft',   `rgba(${r}, ${g}, ${b}, 0.7)`);
    root.setProperty('--tf-accent-hover',  `rgba(${r}, ${g}, ${b}, 0.85)`);
    root.setProperty('--tf-accent-tint',   `rgba(${r}, ${g}, ${b}, 0.25)`);
    // keep legacy aliases in sync
    root.setProperty('--sd-spotify-green',       hex);
    root.setProperty('--sd-spotify-green-bright', bright);
    root.setProperty('--sd-spotify-green-soft',  `rgba(${r}, ${g}, ${b}, 0.7)`);
    root.setProperty('--sd-spotify-green-hover', `rgba(${r}, ${g}, ${b}, 0.85)`);
    root.setProperty('--sd-spotify-green-tint',  `rgba(${r}, ${g}, ${b}, 0.25)`);
}

export function applySpeed(speedId) {
    const s = SPEED_OPTIONS.find(o => o.id === speedId) ?? SPEED_OPTIONS[1];
    const root = document.documentElement.style;
    root.setProperty('--sd-dur-fast', s.fast);
    root.setProperty('--sd-dur-base', s.base);
    root.setProperty('--sd-dur-slow', s.slow);
    root.setProperty('--fade-dur', s.fadeDur);
}

export function getSpeedOption(speedId) {
    return SPEED_OPTIONS.find(o => o.id === speedId) ?? SPEED_OPTIONS[1];
}

export function applyDensity(density) {
    document.documentElement.setAttribute('data-density', density ?? 'normal');
}

export function applySongLayout(layout) {
    document.documentElement.setAttribute('data-song-layout', layout ?? 'grid');
}
