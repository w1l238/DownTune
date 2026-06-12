import React, { useState, useEffect } from 'react';
import { FiSave, FiDatabase, FiSettings, FiLayout, FiX, FiLoader, FiDownload, FiEye, FiEyeOff, FiRotateCcw } from 'react-icons/fi';
import './css/Settings.css';
import CustomDropdown from '../components/CustomDropdown';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../utils/apiClient';
import { useDownloads } from '../contexts/DownloadContext';
import { ACCENT_PRESETS, SPEED_OPTIONS, applyAccent, applySpeed, applyDensity } from '../utils/appearance';

function ChoicePills({ groupId, options, value, onChange, pillGroupClass }) {
    const selected = options.find(o => o.id === value);
    const helperId = `${groupId}-helper`;

    return (
        <div className="compact-choice-group-wrap">
            <div
                className={`compact-choice-group${pillGroupClass ? ' ' + pillGroupClass : ''}`}
                role="radiogroup"
                aria-labelledby={groupId}
                aria-describedby={selected ? helperId : undefined}
            >
                {options.map(option => (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={value === option.id}
                        aria-label={`${option.label}: ${option.description}`}
                        data-description={option.description}
                        className={`setting-choice-pill${value === option.id ? ' active' : ''}`}
                        onClick={() => onChange(option.id)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {selected && (
                <p id={helperId} className="choice-helper-line" aria-live="polite">
                    <strong>{selected.label}</strong>{' — '}{selected.description}
                </p>
            )}
        </div>
    );
}

const Settings = () => {
    const { showNotification } = useDownloads();

    useEffect(() => {
        document.title = 'Settings — DownTune';
    }, []);

    const [limit, setLimit] = useState(() => parseInt(localStorage.getItem('spotify_results_limit') || '20', 10));
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [hasExistingSecret, setHasExistingSecret] = useState(false);
    const [downloadPath, setDownloadPath] = useState('');
    const [searchProvider, setSearchProvider] = useState('spotify');
    const [autoScan, setAutoScan] = useState(() => localStorage.getItem('auto_scan_library') === 'true');
    const [autoRefreshLibrary, setAutoRefreshLibrary] = useState(() => localStorage.getItem('auto_refresh_library') !== 'false');
    const [background, setBackground] = useState(() => localStorage.getItem('app_background') || 'linear-gradient(-45deg, #0350a2, #23a6d5, #23d5ab, #0350a2)');
    const [bgImageUrl, setBgImageUrl] = useState(() => localStorage.getItem('app_bg_image') || '');
    const [appliedBgImage, setAppliedBgImage] = useState(() => localStorage.getItem('app_bg_image') || '');
    const [bgDim, setBgDim] = useState(() => parseFloat(localStorage.getItem('app_bg_dim') || '0'));
    const [albumArtStyle, setAlbumArtStyle] = useState(() => localStorage.getItem('album_art_style') || 'background');
    const [blurBase, setBlurBase] = useState(() => parseFloat(localStorage.getItem('app_blur_base') || '10'));
    const [accent, setAccent] = useState(() => localStorage.getItem('app_accent') || 'teal');
    const [animSpeed, setAnimSpeed] = useState(() => localStorage.getItem('app_animation_speed') || 'normal');
    const [density, setDensity] = useState(() => localStorage.getItem('app_density') || 'normal');
    const [saving, setSaving] = useState(false);
    const [savedSettings, setSavedSettings] = useState(null);
    const [showClientSecret, setShowClientSecret] = useState(false);
    const [albumDownloadMode, setAlbumDownloadMode] = useState(
        () => localStorage.getItem('download_album_mode') || 'sequential'
    );
    const [audioQualityPreset, setAudioQualityPreset] = useState('high');
    const [audioQualityPresets, setAudioQualityPresets] = useState([
        { id: 'balanced', label: 'Balanced', description: 'Current smaller-file MP3 behavior, around 130–140 kb/s.' },
        { id: 'high', label: 'High Quality VBR', description: 'Recommended. Better MP3 transcodes using VBR quality 0.' },
        { id: 'max', label: '320 kb/s CBR', description: 'Largest MP3 files. Cannot restore detail beyond the YouTube source.' },
    ]);
    const [audioFormat, setAudioFormat] = useState('mp3');
    const [audioFormats, setAudioFormats] = useState([
        { id: 'mp3',  label: 'MP3',       description: 'Best compatibility. Uses the MP3 quality setting below.' },
        { id: 'm4a',  label: 'M4A / AAC', description: 'Modern lossy format with broad support. Often closer to YouTube source audio.' },
        { id: 'opus', label: 'Opus',      description: 'Best quality per file size. Great for streaming; older devices may not support it.' },
        { id: 'flac', label: 'FLAC',      description: 'Large files. Does not restore YouTube source quality, but avoids another lossy output.' },
    ]);

    const createSettingsSnapshot = (overrides = {}) => ({
        limit,
        clientId,
        clientSecret,
        hasExistingSecret,
        downloadPath,
        searchProvider,
        autoScan,
        autoRefreshLibrary,
        background,
        bgImageUrl,
        bgDim,
        albumArtStyle,
        blurBase,
        accent,
        animSpeed,
        density,
        albumDownloadMode,
        audioFormat,
        audioQualityPreset,
        ...overrides,
    });

    const backgrounds = [
        { name: 'Ocean Default', value: 'linear-gradient(-45deg, #0350a2, #23a6d5, #23d5ab, #0350a2)' },
        { name: 'Spotify Green', value: 'linear-gradient(-45deg, #1db954, #1ed760, #1db954, #191414)' },
        { name: 'Deep Purple', value: 'linear-gradient(-45deg, #2e0249, #570a57, #a91079, #2e0249)' },
        { name: 'Midnight Blue', value: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #0f0c29)' },
        { name: 'Ocean Wave', value: 'linear-gradient(-45deg, #2193b0, #6dd5ed, #2193b0, #6dd5ed)' },
        { name: 'Forest Green', value: 'linear-gradient(-45deg, #11998e, #38ef7d, #11998e, #38ef7d)' },
        { name: 'Cosmic Neon', value: 'linear-gradient(-45deg, #833ab4, #fd1d1d, #fcb045, #833ab4)' },
        { name: 'Lava Flow', value: 'linear-gradient(-45deg, #b22222, #ff0000, #800000, #b22222)' },
        { name: 'Sunset Vibes', value: 'linear-gradient(-45deg, #ff512f, #dd2476, #ff512f, #dd2476)' },
        { name: 'Midnight City', value: 'linear-gradient(-45deg, #232526, #414345, #232526, #414345)' },
        { name: 'Cyberpunk', value: 'linear-gradient(-45deg, #ff00ff, #00ffff, #ff00ff, #00ffff)' },
    ];

    useEffect(() => {
        fetch(`${API_BASE_URL}/config`)
            .then(res => res.json())
            .then(data => {
                const loaded = {
                    clientId: data.clientId || '',
                    clientSecret: '',
                    hasExistingSecret: !!data.hasClientSecret,
                    downloadPath: data.downloadPath || '',
                    searchProvider: data.searchProvider || 'spotify',
                    audioQualityPreset: data.audioQualityPreset || 'high',
                    audioFormat: data.audioFormat || 'mp3',
                };

                setClientId(loaded.clientId);
                // Server never returns the secret value; only indicates whether one is saved
                setHasExistingSecret(loaded.hasExistingSecret);
                setDownloadPath(loaded.downloadPath);
                setSearchProvider(loaded.searchProvider);
                setAudioQualityPreset(loaded.audioQualityPreset);
                if (Array.isArray(data.audioQualityPresets)) setAudioQualityPresets(data.audioQualityPresets);
                setAudioFormat(loaded.audioFormat);
                if (Array.isArray(data.audioFormats)) setAudioFormats(data.audioFormats);
                setSavedSettings(createSettingsSnapshot(loaded));
            })
            .catch(() => {
                setSavedSettings(createSettingsSnapshot({ clientSecret: '' }));
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const applyBlur = (base) => {
        const r = document.documentElement.style;
        r.setProperty('--sd-blur-sm', `${base * 0.5}px`);
        r.setProperty('--sd-blur-md', `${base}px`);
        r.setProperty('--sd-blur-lg', `${base * 1.5}px`);
        r.setProperty('--sd-blur-xl', `${base * 2}px`);
    };

    const applyBackgroundPreview = (imageUrl, gradient, dimness) => {
        if (imageUrl) {
            document.body.style.background = `url(${imageUrl}) center / cover fixed`;
            document.body.style.animation = 'none';
            document.body.style.setProperty('--bg-dim', dimness);
        } else {
            document.body.style.background = '';
            document.body.style.animation = '';
            document.documentElement.style.setProperty('--app-background', gradient);
            document.body.style.setProperty('--bg-dim', '0');
        }
    };

    const currentSettings = createSettingsSnapshot();
    const hasUnsavedChanges = !!savedSettings && JSON.stringify(currentSettings) !== JSON.stringify(savedSettings);
    const selectedAudioFormatLabel = audioFormats.find(format => format.id === audioFormat)?.label || audioFormat.toUpperCase();
    const providerHelperText = searchProvider === 'spotify'
        ? 'Uses Spotify search and requires Spotify API credentials below.'
        : 'Uses Deezer search. No Spotify API credentials required.';
    const spotifyStatus = hasExistingSecret || clientSecret ? 'Configured' : 'Needs credentials';

    const handleReset = () => {
        if (!savedSettings) return;
        setLimit(savedSettings.limit);
        setClientId(savedSettings.clientId);
        setClientSecret('');
        setShowClientSecret(false);
        setHasExistingSecret(savedSettings.hasExistingSecret);
        setDownloadPath(savedSettings.downloadPath);
        setSearchProvider(savedSettings.searchProvider);
        setAutoScan(savedSettings.autoScan);
        setAutoRefreshLibrary(savedSettings.autoRefreshLibrary);
        setBackground(savedSettings.background);
        setBgImageUrl(savedSettings.bgImageUrl);
        setAppliedBgImage(savedSettings.bgImageUrl);
        setBgDim(savedSettings.bgImageUrl ? savedSettings.bgDim : 0);
        setAlbumArtStyle(savedSettings.albumArtStyle);
        setBlurBase(savedSettings.blurBase);
        setAccent(savedSettings.accent);
        setAnimSpeed(savedSettings.animSpeed);
        setDensity(savedSettings.density);
        setAlbumDownloadMode(savedSettings.albumDownloadMode);
        setAudioFormat(savedSettings.audioFormat);
        setAudioQualityPreset(savedSettings.audioQualityPreset);
        applyAccent(savedSettings.accent);
        applySpeed(savedSettings.animSpeed);
        applyDensity(savedSettings.density);
        applyBlur(savedSettings.blurBase);
        applyBackgroundPreview(savedSettings.bgImageUrl, savedSettings.background, savedSettings.bgDim);
    };

    const handleSave = async () => {
        if (limit < 1 || limit > 50) {
            showNotification('Results limit must be between 1 and 50.', 'error');
            return;
        }
        setSaving(true);
        const imageUrl = bgImageUrl.trim();
        const savedBgDim = imageUrl ? bgDim : 0;

        try {
            localStorage.setItem('spotify_results_limit', limit);
            localStorage.setItem('auto_scan_library', autoScan);
            localStorage.setItem('auto_refresh_library', autoRefreshLibrary);
            localStorage.setItem('app_background', background);
            localStorage.setItem('app_bg_image', imageUrl);
            localStorage.setItem('app_bg_dim', savedBgDim);
            localStorage.setItem('album_art_style', albumArtStyle);
            localStorage.setItem('app_blur_base', blurBase);
            localStorage.setItem('app_accent', accent);
            localStorage.setItem('app_animation_speed', animSpeed);
            applyAccent(accent);
            localStorage.setItem('app_density', density);
            localStorage.setItem('download_album_mode', albumDownloadMode);
        } catch { /* storage quota exceeded — continue with save */ }

        setAppliedBgImage(imageUrl);
        if (imageUrl) {
            document.body.style.background = `url(${imageUrl}) center / cover fixed`;
            document.body.style.animation = 'none';
            document.body.style.setProperty('--bg-dim', bgDim);
        } else {
            document.body.style.background = '';
            document.body.style.animation = '';
            document.documentElement.style.setProperty('--app-background', background);
            document.body.style.setProperty('--bg-dim', '0');
            setBgDim(0);
        }

        try {
            // Send blank clientSecret to signal "keep existing"; server preserves it
            await apiFetch('/config', {
                method: 'POST',
                body: { clientId, clientSecret, downloadPath, searchProvider, audioFormat, audioQualityPreset },
            });
            const nextHasExistingSecret = clientSecret ? true : hasExistingSecret;
            setHasExistingSecret(nextHasExistingSecret);
            setClientSecret('');
            setShowClientSecret(false);
            setBgImageUrl(imageUrl);
            setBgDim(savedBgDim);
            setSavedSettings(createSettingsSnapshot({
                clientSecret: '',
                hasExistingSecret: nextHasExistingSecret,
                bgImageUrl: imageUrl,
                bgDim: savedBgDim,
            }));
            showNotification('Settings saved!', 'success');
        } catch (err) {
            showNotification(`Error saving config: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-page">
            <h1>Settings</h1>

            {/* Appearance */}
            <div className="settings-section">
                <div className="section-heading">
                    <h3 className="section-title"><FiLayout /> Appearance</h3>
                    <p className="section-summary">{accent} accent · {density} density · {animSpeed} motion</p>
                </div>
                <div className={`field${bgImageUrl ? ' field-disabled' : ''}`}>
                    <label>Background Gradient</label>
                    <CustomDropdown
                        options={backgrounds}
                        value={background}
                        onChange={setBackground}
                        onToggle={() => {}}
                        disabled={!!bgImageUrl}
                    />
                    <p className="field-desc">Choose a gradient theme. Overridden by image URL if set.</p>
                </div>
                <div className="field">
                    <label>Background Image URL</label>
                    <div className="bg-image-row">
                        <input
                            type="text"
                            className="settings-input"
                            value={bgImageUrl}
                            onChange={e => setBgImageUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                        />
                        {bgImageUrl && (
                            <button
                                className="bg-image-clear"
                                onClick={() => setBgImageUrl('')}
                                title="Clear image URL"
                                type="button"
                            >
                                <FiX size={14} />
                            </button>
                        )}
                    </div>
                    <p className="field-desc">Use a direct image link as the background. Saves with the button below.</p>
                </div>
                <div className="field mobile-only">
                    <label>Mobile Album Art Style</label>
                    <div className="art-style-toggle">
                        <button
                            type="button"
                            className={`art-style-btn${albumArtStyle === 'background' ? ' active' : ''}`}
                            onClick={() => setAlbumArtStyle('background')}
                        >
                            Full Background
                        </button>
                        <button
                            type="button"
                            className={`art-style-btn${albumArtStyle === 'card' ? ' active' : ''}`}
                            onClick={() => setAlbumArtStyle('card')}
                        >
                            Centered Card
                        </button>
                    </div>
                    <p className="field-desc">How album artwork is displayed on the mobile album screen.</p>
                </div>

                <div className={`field${!appliedBgImage ? ' field-disabled' : ''}`}>
                    <label>Background Dimness</label>
                    <div className="dim-slider-row">
                        <input
                            type="range"
                            className="dim-slider"
                            min="0"
                            max="0.85"
                            step="0.01"
                            value={bgDim}
                            disabled={!appliedBgImage}
                            style={{ '--fill': `${Math.round((bgDim / 0.85) * 100)}%` }}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                e.target.style.setProperty('--fill', `${Math.round((v / 0.85) * 100)}%`);
                                setBgDim(v);
                                document.body.style.setProperty('--bg-dim', v);
                            }}
                        />
                        <span className="dim-value">{Math.round(bgDim * 100)}%</span>
                    </div>
                    <p className="field-desc">Darken the background image so text is easier to read.</p>
                </div>
                <div className="field">
                    <label>Glass Blur Intensity</label>
                    <div className="dim-slider-row">
                        <input
                            type="range"
                            className="dim-slider"
                            min="0"
                            max="20"
                            step="1"
                            value={blurBase}
                            style={{ '--fill': `${Math.round((blurBase / 20) * 100)}%` }}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                e.target.style.setProperty('--fill', `${Math.round((v / 20) * 100)}%`);
                                setBlurBase(v);
                                applyBlur(v);
                            }}
                        />
                        <span className="dim-value">{blurBase}px</span>
                    </div>
                    <p className="field-desc">Controls the frosted glass blur across the entire UI. 0 disables it, 10 is the default.</p>
                </div>

                <div className="field">
                    <label>Accent Color</label>
                    <div className="accent-swatches">
                        {ACCENT_PRESETS.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                className={`accent-swatch${accent === p.id ? ' active' : ''}`}
                                style={{ '--swatch-color': p.hex, '--swatch-bright': p.bright }}
                                title={p.label}
                                onClick={() => {
                                    setAccent(p.id);
                                }}
                            />
                        ))}
                    </div>
                    <p className="field-desc">Changes buttons, active states, progress bars, and highlights throughout the app.</p>
                </div>

                <div className="field">
                    <label>Animation Speed</label>
                    <div className="art-style-toggle">
                        {SPEED_OPTIONS.map(o => (
                            <button
                                key={o.id}
                                type="button"
                                className={`art-style-btn${animSpeed === o.id ? ' active' : ''}`}
                                onClick={() => { setAnimSpeed(o.id); applySpeed(o.id); }}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                    <p className="field-desc">Controls the speed of all hover and transition animations across the UI.</p>
                </div>

                <div className="field">
                    <label>Song Row Density</label>
                    <div className="art-style-toggle">
                        {['compact', 'normal', 'roomy'].map(d => (
                            <button
                                key={d}
                                type="button"
                                className={`art-style-btn${density === d ? ' active' : ''}`}
                                onClick={() => { setDensity(d); applyDensity(d); }}
                            >
                                {d.charAt(0).toUpperCase() + d.slice(1)}
                            </button>
                        ))}
                    </div>
                    <p className="field-desc">How much vertical space each song row takes in your library and album views.</p>
                </div>

            </div>

            {/* Downloads */}
            <div className="settings-section">
                <div className="section-heading">
                    <h3 className="section-title"><FiDownload /> Downloads</h3>
                    <p className="section-summary">{selectedAudioFormatLabel} output · {downloadPath || 'Default location'}</p>
                </div>
                <div className="field">
                    <label>Album Download Mode</label>
                    <div className="art-style-toggle">
                        <button
                            type="button"
                            className={`art-style-btn${albumDownloadMode === 'sequential' ? ' active' : ''}`}
                            onClick={() => setAlbumDownloadMode('sequential')}
                        >
                            Sequential
                        </button>
                        <button
                            type="button"
                            className={`art-style-btn${albumDownloadMode === 'parallel' ? ' active' : ''}`}
                            onClick={() => setAlbumDownloadMode('parallel')}
                        >
                            Parallel
                        </button>
                    </div>
                    <p className="field-desc">Sequential downloads one track at a time in order. Parallel fires all downloads simultaneously — faster but heavier on the server.</p>
                </div>
                <div className="field">
                    <label id="audio-format-label">Audio Format</label>
                    <ChoicePills
                        groupId="audio-format-label"
                        options={audioFormats}
                        value={audioFormat}
                        onChange={setAudioFormat}
                        pillGroupClass="wrap-2x2"
                    />
                    <p className="field-desc">Output format for downloaded audio. YouTube source is already lossy — format choice affects encoding, not source quality.</p>
                </div>
                {audioFormat === 'mp3' && (
                <div className="field">
                    <label id="audio-quality-label">MP3 Quality</label>
                    <ChoicePills
                        groupId="audio-quality-label"
                        options={audioQualityPresets}
                        value={audioQualityPreset}
                        onChange={setAudioQualityPreset}
                    />
                    <p className="field-desc">MP3 transcode quality. Source audio is still limited by YouTube&apos;s available stream.</p>
                </div>
                )}
            </div>

            {/* Library & Search */}
            <div className="settings-section">
                <div className="section-heading">
                    <h3 className="section-title"><FiDatabase /> Library & Search</h3>
                    <p className="section-summary">{searchProvider === 'spotify' ? 'Spotify' : 'Deezer'} provider · {limit} results</p>
                </div>
                <div className="field">
                    <label>Download Location</label>
                    <input
                        type="text"
                        className="settings-input"
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        placeholder="e.g. /home/user/Music"
                    />
                    <p className="field-desc">Absolute path to save downloads. Leave empty for default.</p>
                </div>
                <div className="field">
                    <label>Search Provider</label>
                    <CustomDropdown
                        options={[
                            { name: 'Spotify', value: 'spotify' },
                            { name: 'Deezer', value: 'deezer' },
                        ]}
                        value={searchProvider}
                        onChange={setSearchProvider}
                        onToggle={() => {}}
                    />
                    <p className="field-desc">{providerHelperText}</p>
                </div>
                <div className="field">
                    <label>Search Results Limit</label>
                    <input
                        type="number"
                        className="settings-input"
                        value={limit}
                        onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
                        min="1"
                        max="50"
                    />
                    <p className="field-desc">Number of songs to show in search results (1-50).</p>
                </div>
                <div className="field">
                    <label className="cb-label">
                        <input
                            type="checkbox"
                            checked={autoScan}
                            onChange={(e) => setAutoScan(e.target.checked)}
                        />
                        <span className="cb-box" />
                        <span>Auto-scan library on startup</span>
                    </label>
                    <p className="field-desc">Automatically refresh the library when you open the app.</p>
                </div>
                <div className="field">
                    <label className="cb-label">
                        <input
                            type="checkbox"
                            checked={autoRefreshLibrary}
                            onChange={(e) => setAutoRefreshLibrary(e.target.checked)}
                        />
                        <span className="cb-box" />
                        <span>Auto-refresh library after download</span>
                    </label>
                    <p className="field-desc">Update your library view automatically when a song finishes downloading.</p>
                </div>
            </div>

            {/* Spotify API */}
            {searchProvider === 'spotify' && (
                <div className="settings-section">
                    <div className="section-heading">
                        <h3 className="section-title"><FiSettings /> Spotify API</h3>
                        <p className={`section-summary${spotifyStatus === 'Needs credentials' ? ' warning' : ''}`}>{spotifyStatus}</p>
                    </div>
                    <p className="field-desc">Required for Spotify search results. Stored secrets are never displayed.</p>
                    <div className="field">
                        <label>Client ID</label>
                        <input
                            type="text"
                            className="settings-input"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="Enter your Spotify Client ID"
                        />
                    </div>
                    <div className="field">
                        <label>Client Secret</label>
                        <div className="secret-input-row">
                            <input
                                type={showClientSecret && clientSecret ? 'text' : 'password'}
                                className="settings-input"
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                placeholder={hasExistingSecret ? 'Configured — leave blank to keep existing secret' : 'Enter your Spotify Client Secret'}
                            />
                            {clientSecret && (
                                <button
                                    type="button"
                                    className="secret-toggle"
                                    onClick={() => setShowClientSecret(value => !value)}
                                    aria-label={showClientSecret ? 'Hide newly typed Spotify secret' : 'Show newly typed Spotify secret'}
                                    title={showClientSecret ? 'Hide newly typed secret' : 'Show newly typed secret'}
                                >
                                    {showClientSecret ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                                </button>
                            )}
                        </div>
                        <p className="field-desc">
                            {clientSecret
                                ? 'New secret will replace the saved value when you save.'
                                : hasExistingSecret
                                    ? 'A secret is saved. Leave blank to keep it, or type a new value to replace it.'
                                    : 'Required for Spotify search.'}
                        </p>
                    </div>
                </div>
            )}

            <div className={`settings-save-bar${hasUnsavedChanges ? ' dirty' : ''}`}>
                <span className="save-status">{hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</span>
                <div className="save-actions">
                    <button className="btn-reset" type="button" onClick={handleReset} disabled={!hasUnsavedChanges || saving}>
                        <FiRotateCcw />
                        Reset
                    </button>
                    <button className="btn-save" onClick={handleSave} disabled={!hasUnsavedChanges || saving}>
                        {saving ? <FiLoader className="btn-save-spin" /> : <FiSave />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
