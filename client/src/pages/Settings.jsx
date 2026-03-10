import React, { useState, useEffect } from 'react';
import { FiSave, FiMonitor, FiDatabase, FiSettings, FiLayout, FiHardDrive } from 'react-icons/fi';
import './css/Settings.css';
import Popup from '../components/Popup';
import CustomDropdown from '../components/CustomDropdown';
import { API_BASE_URL } from '../config';

const Settings = () => {
    useEffect(() => {
        document.title = 'Settings - Spotify Downloader';
    }, []);

    const [limit, setLimit] = useState(20);
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [downloadPath, setDownloadPath] = useState('');
    const [autoScan, setAutoScan] = useState(false);
    const [background, setBackground] = useState('linear-gradient(-45deg, #0350a2, #23a6d5, #23d5ab, #0350a2)');
    const [popup, setPopup] = useState({ visible: false, message: '', type: '' });
    const [activeSection, setActiveSection] = useState(null);
    const [animationsDone, setAnimationsDone] = useState(false);

    const backgrounds = [
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
        const savedLimit = localStorage.getItem('spotify_results_limit');
        if (savedLimit) {
            setLimit(parseInt(savedLimit, 10));
        }

        const savedAutoScan = localStorage.getItem('auto_scan_library');
        if (savedAutoScan) {
            setAutoScan(savedAutoScan === 'true');
        }

        const savedBg = localStorage.getItem('app_background');
        if (savedBg) {
            setBackground(savedBg);
        }

        // Fetch config from backend
        fetch(`${API_BASE_URL}/config`)
            .then(res => res.json())
            .then(data => {
                if (data.clientId) setClientId(data.clientId);
                if (data.clientSecret) setClientSecret(data.clientSecret);
                if (data.downloadPath) setDownloadPath(data.downloadPath);
            })
            .catch(err => console.error('Error fetching config:', err));
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setAnimationsDone(true), 1200);
        return () => clearTimeout(timer);
    }, []);

    const handleSave = async () => {
        let success = true;

        // Save Limit
        if (limit > 0 && limit <= 50) {
            localStorage.setItem('spotify_results_limit', limit);
        } else {
            setPopup({ visible: true, message: 'Limit must be between 1 and 50.', type: 'error' });
            return; // Stop if limit is invalid
        }

        // Save AutoScan
        localStorage.setItem('auto_scan_library', autoScan);

        // Save Background
        localStorage.setItem('app_background', background);
        document.documentElement.style.setProperty('--app-background', background);

        // Save Config
        try {
            const response = await fetch(`${API_BASE_URL}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret, downloadPath })
            });
            if (!response.ok) {
                const errData = await response.json();
                setPopup({ visible: true, message: `Error saving config: ${errData.error}`, type: 'error' });
                success = false;
            }
        } catch (err) {
            console.error('Error saving config:', err);
            setPopup({ visible: true, message: 'Network error while saving config.', type: 'error' });
            success = false;
        }

        if (success) {
            setPopup({ visible: true, message: 'Settings saved!', type: 'success' });
        }
    };

    return (
        <div className={`settings-container ${activeSection ? 'has-active-dropdown' : ''}`}>
            {popup.visible && (
                <Popup 
                    message={popup.message} 
                    type={popup.type} 
                    onClose={() => setPopup({ visible: false, message: '', type: '' })} 
                />
            )}
            
            <div className="settings-header fade-in">
                <h1>Settings</h1>
                <button className="save-btn-top" onClick={handleSave}>
                    <FiSave style={{ marginRight: '0.5rem' }} /> Save Changes
                </button>
            </div>

            <div className="settings-grid">
                {/* Appearance Section */}
                <div 
                    className={`settings-section ${!animationsDone ? 'fade-in' : ''} ${activeSection === 'appearance' ? 'z-top' : (activeSection ? 'dimmed' : '')}`} 
                    style={{ animationDelay: '0.1s' }}
                >
                    <div className="section-header">
                        <FiLayout />
                        <h2>Appearance</h2>
                    </div>
                    <div className="setting-group">
                        <label htmlFor="bg-select">App Background</label>
                        <CustomDropdown 
                            options={backgrounds}
                            value={background}
                            onChange={setBackground}
                            onToggle={(isOpen) => setActiveSection(isOpen ? 'appearance' : null)}
                        />
                        <p className="setting-desc">Choose a color theme for the application.</p>
                    </div>
                </div>

                {/* Library & Search Section */}
                <div className={`settings-section ${!animationsDone ? 'fade-in' : ''} ${activeSection ? 'dimmed' : ''}`} style={{ animationDelay: '0.2s' }}>
                    <div className="section-header">
                        <FiDatabase />
                        <h2>Library & Search</h2>
                    </div>
                    <div className="setting-group">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={autoScan} 
                                onChange={(e) => setAutoScan(e.target.checked)} 
                            />
                            <span>Auto-scan library on startup</span>
                        </label>
                        <p className="setting-desc">Automatically refresh the library when you open the app.</p>
                    </div>
                    <div className="setting-group">
                        <label htmlFor="results-limit">Search Results Limit</label>
                        <input
                            type="number"
                            id="results-limit"
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                            min="1"
                            max="50"
                        />
                        <p className="setting-desc">Number of songs to show in search results (1-50).</p>
                    </div>
                </div>

                {/* Spotify API Section */}
                <div className={`settings-section ${!animationsDone ? 'fade-in' : ''} ${activeSection ? 'dimmed' : ''}`} style={{ animationDelay: '0.3s' }}>
                    <div className="section-header">
                        <FiSettings />
                        <h2>Spotify API</h2>
                    </div>
                    <div className="setting-group">
                        <label htmlFor="client-id">Client ID</label>
                        <input
                            type="text"
                            id="client-id"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="Enter your Spotify Client ID"
                        />
                    </div>
                    <div className="setting-group">
                        <label htmlFor="client-secret">Client Secret</label>
                        <input
                            type="password"
                            id="client-secret"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder="Enter your Spotify Client Secret"
                        />
                    </div>
                    <p className="setting-desc">Required for searching songs on Spotify.</p>
                </div>

                {/* Storage Section */}
                <div className={`settings-section ${!animationsDone ? 'fade-in' : ''} ${activeSection ? 'dimmed' : ''}`} style={{ animationDelay: '0.4s' }}>
                    <div className="section-header">
                        <FiHardDrive />
                        <h2>Storage</h2>
                    </div>
                    <div className="setting-group">
                        <label htmlFor="download-path">Download Location</label>
                        <input
                            type="text"
                            id="download-path"
                            value={downloadPath}
                            onChange={(e) => setDownloadPath(e.target.value)}
                            placeholder="e.g. /home/user/Music"
                        />
                        <p className="setting-desc">
                            Absolute path to save downloads. Leave empty for default.
                        </p>
                    </div>
                </div>
            </div>
            
            <button className="save-btn-bottom mobile-only fade-in" style={{ animationDelay: '0.5s' }} onClick={handleSave}>
                Save Changes
            </button>
        </div>
    );
};

export default Settings;