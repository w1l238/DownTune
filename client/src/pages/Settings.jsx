import React, { useState, useEffect } from 'react';
import { FiSave, FiMonitor, FiDatabase, FiSettings, FiLayout, FiHardDrive, FiX, FiLoader } from 'react-icons/fi';
import './css/Settings.css';
import CustomDropdown from '../components/CustomDropdown';
import { API_BASE_URL } from '../config';
import { useDownloads } from '../contexts/DownloadContext';

const Settings = () => {
    const { showNotification } = useDownloads();

    useEffect(() => {
        document.title = 'Settings — DownTune';
    }, []);

    const [limit, setLimit] = useState(() => parseInt(localStorage.getItem('spotify_results_limit') || '20', 10));
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [downloadPath, setDownloadPath] = useState('');
    const [searchProvider, setSearchProvider] = useState('spotify');
    const [autoScan, setAutoScan] = useState(() => localStorage.getItem('auto_scan_library') === 'true');
    const [autoRefreshLibrary, setAutoRefreshLibrary] = useState(() => localStorage.getItem('auto_refresh_library') !== 'false');
    const [background, setBackground] = useState(() => localStorage.getItem('app_background') || 'linear-gradient(-45deg, #0350a2, #23a6d5, #23d5ab, #0350a2)');
    const [bgImageUrl, setBgImageUrl] = useState(() => localStorage.getItem('app_bg_image') || '');
    const [appliedBgImage, setAppliedBgImage] = useState(() => localStorage.getItem('app_bg_image') || '');
    const [bgDim, setBgDim] = useState(() => parseFloat(localStorage.getItem('app_bg_dim') || '0'));
    const [albumArtStyle, setAlbumArtStyle] = useState(() => localStorage.getItem('album_art_style') || 'background');
    const [saving, setSaving] = useState(false);

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
                if (data.clientId) setClientId(data.clientId);
                if (data.clientSecret) setClientSecret(data.clientSecret);
                if (data.downloadPath) setDownloadPath(data.downloadPath);
                if (data.searchProvider) setSearchProvider(data.searchProvider);
            })
            .catch(() => {});
    }, []);

    const handleSave = async () => {
        if (limit < 1 || limit > 50) {
            showNotification('Results limit must be between 1 and 50.', 'error');
            return;
        }
        setSaving(true);

        try {
            localStorage.setItem('spotify_results_limit', limit);
            localStorage.setItem('auto_scan_library', autoScan);
            localStorage.setItem('auto_refresh_library', autoRefreshLibrary);
            localStorage.setItem('app_background', background);
            localStorage.setItem('app_bg_image', bgImageUrl.trim());
            localStorage.setItem('app_bg_dim', bgDim);
            localStorage.setItem('album_art_style', albumArtStyle);
        } catch { /* storage quota exceeded — continue with save */ }

        const imageUrl = bgImageUrl.trim();
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
            const response = await fetch(`${API_BASE_URL}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret, downloadPath, searchProvider }),
            });
            if (response.ok) {
                showNotification('Settings saved!', 'success');
            } else {
                const err = await response.json();
                showNotification(`Error saving config: ${err.error}`, 'error');
            }
        } catch {
            showNotification('Network error while saving config.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-page">
            <h1>Settings</h1>

            {/* Appearance */}
            <div className="settings-section">
                <h3 className="section-title"><FiLayout /> Appearance</h3>
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
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                setBgDim(v);
                                document.body.style.setProperty('--bg-dim', v);
                            }}
                        />
                        <span className="dim-value">{Math.round(bgDim * 100)}%</span>
                    </div>
                    <p className="field-desc">Darken the background image so text is easier to read.</p>
                </div>
            </div>

            {/* Library & Search */}
            <div className="settings-section">
                <h3 className="section-title"><FiDatabase /> Library & Search</h3>
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
                    <p className="field-desc">Choose which service to use for searching songs.</p>
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
            <div className={`settings-section ${searchProvider !== 'spotify' ? 'disabled' : ''}`}>
                <h3 className="section-title"><FiSettings /> Spotify API</h3>
                <div className="field">
                    <label>Client ID</label>
                    <input
                        type="text"
                        className="settings-input"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Enter your Spotify Client ID"
                        disabled={searchProvider !== 'spotify'}
                    />
                </div>
                <div className="field">
                    <label>Client Secret</label>
                    <input
                        type="password"
                        className="settings-input"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Enter your Spotify Client Secret"
                        disabled={searchProvider !== 'spotify'}
                    />
                    <p className="field-desc">
                        {searchProvider === 'spotify'
                            ? 'Required for searching songs on Spotify.'
                            : 'Only required if Spotify is selected as the provider.'}
                    </p>
                </div>
            </div>

            <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <FiLoader className="btn-save-spin" /> : <FiSave />}
                {saving ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    );
};

export default Settings;
