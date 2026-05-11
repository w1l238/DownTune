import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiMusic, FiDisc, FiUsers, FiDownload, FiSearch, FiX, FiClock, FiSliders } from 'react-icons/fi';
import { API_BASE_URL } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import './css/Home.css';

const PREFS_KEY = 'home_prefs';

const defaultPrefs = { recentAlbums: 15, recentTracks: 15, sidebarArtists: 10 };

const loadPrefs = () => {
    try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
    catch { return defaultPrefs; }
};

const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
};

const Home = () => {
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [showPrefs, setShowPrefs] = useState(false);
    const [prefs, setPrefs] = useState(loadPrefs);
    const [draft, setDraft] = useState(loadPrefs);
    const navigate = useNavigate();

    const fetchLibrary = useCallback(() => {
        fetch(`${API_BASE_URL}/api/library`)
            .then(r => r.json())
            .then(data => { setSongs(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        document.title = 'Home — DownTune';
        fetchLibrary();
    }, []);

    useAutoRefresh(fetchLibrary);

    const totalAlbums = useMemo(() => new Set(songs.map(s => s.album || 'Unknown')).size, [songs]);
    const totalArtists = useMemo(() => new Set(songs.map(s => s.artist || 'Unknown')).size, [songs]);

    const recentTracks = useMemo(() => songs.slice(-prefs.recentTracks).reverse(), [songs, prefs.recentTracks]);

    const recentAlbums = useMemo(() => {
        const seen = new Set();
        const albums = [];
        for (const s of [...songs].reverse()) {
            const key = s.album || 'Unknown Album';
            if (!seen.has(key)) {
                seen.add(key);
                albums.push({ name: key, artist: s.artist || 'Unknown Artist', artId: s.id });
            }
            if (albums.length >= prefs.recentAlbums) break;
        }
        return albums;
    }, [songs, prefs.recentAlbums]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        navigate('/results', { state: { query: query.trim() } });
    };

    const openPrefs = () => { setDraft(prefs); setShowPrefs(true); };
    const closePrefs = () => setShowPrefs(false);

    const savePrefs = () => {
        setPrefs(draft);
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(draft)); } catch { /* quota exceeded */ }
        window.dispatchEvent(new CustomEvent('home-prefs-saved'));
        closePrefs();
    };

    const SliderRow = ({ label, field, min, max }) => (
        <div className="home-prefs-row">
            <div className="home-prefs-row-top">
                <span>{label}</span>
                <span className="home-prefs-val">{draft[field]}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={draft[field]}
                onChange={e => setDraft(d => ({ ...d, [field]: parseInt(e.target.value) }))}
                className="home-prefs-slider"
            />
        </div>
    );

    return (
        <div className="home-wrap">

            {/* Hero greeting + search */}
            <div className="home-hero">
                <div className="home-hero-top">
                    <div className="home-greeting">
                        <p className="home-greeting-sub">
                            <span className="home-greeting-sub-desktop">{greeting()}</span>
                            <span className="home-greeting-sub-mobile">DownTune</span>
                        </p>
                        <h1 className="home-greeting-title">
                            <span className="home-greeting-title-desktop">What do you want<br />to listen to?</span>
                            <span className="home-greeting-title-mobile">{greeting()}</span>
                        </h1>
                    </div>
                    <button className="home-prefs-btn" onClick={openPrefs} title="Home preferences">
                        <FiSliders size={15} />
                    </button>
                </div>
                <form className="home-search" onSubmit={handleSearch}>
                    <FiSearch size={16} className="home-search-icon" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search for songs, artists, albums…"
                        autoComplete="off"
                    />
                    {query && (
                        <button
                            type="button"
                            className="home-search-clear"
                            onClick={() => setQuery('')}
                            title="Clear"
                        >
                            <FiX size={14} />
                        </button>
                    )}
                    <button type="submit" className="home-search-btn">Search</button>
                </form>
            </div>

            {/* Stats row */}
            <div className="home-stats">
                <div className="home-stat" onClick={() => navigate('/library')}>
                    <FiMusic size={20} className="home-stat-icon" />
                    <div className="home-stat-val">{songs.length}</div>
                    <div className="home-stat-lab">Songs</div>
                </div>
                <div className="home-stat" onClick={() => navigate('/albums')}>
                    <FiDisc size={20} className="home-stat-icon" />
                    <div className="home-stat-val">{totalAlbums}</div>
                    <div className="home-stat-lab">Albums</div>
                </div>
                <div className="home-stat" onClick={() => navigate('/artists')}>
                    <FiUsers size={20} className="home-stat-icon" />
                    <div className="home-stat-val">{totalArtists}</div>
                    <div className="home-stat-lab">Artists</div>
                </div>
            </div>

            {/* Recently added albums — horizontal scroll strip */}
            {!loading && recentAlbums.length > 0 && (
                <div className="home-section">
                    <h2 className="home-section-title"><FiDisc size={12} /> Recently Added</h2>
                    <div className="home-album-strip">
                        {recentAlbums.map(album => (
                            <div
                                key={album.name}
                                className="home-album-card"
                                onClick={() => navigate(`/album/${encodeURIComponent(album.name)}`)}
                            >
                                <div className="home-album-art">
                                    <img
                                        src={`${API_BASE_URL}/api/files/${encodeURIComponent(album.artId)}/art`}
                                        alt={album.name}
                                        onError={e => { e.target.style.display = 'none'; }}
                                    />
                                </div>
                                <span className="home-album-name">{album.name}</span>
                                <span className="home-album-artist">{album.artist}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent tracks list */}
            {!loading && recentTracks.length > 0 && (
                <div className="home-section">
                    <h2 className="home-section-title"><FiClock size={12} /> Recent Tracks</h2>
                    <div className="home-track-list">
                        {recentTracks.map((song, i) => (
                            <div
                                key={song.id}
                                className="home-track-row"
                                onClick={() => navigate(`/album/${encodeURIComponent(song.album || 'Unknown Album')}`)}
                            >
                                <span className="home-track-num">{i + 1}</span>
                                <div className="home-track-art">
                                    <img
                                        src={`${API_BASE_URL}/api/files/${encodeURIComponent(song.id)}/art`}
                                        alt={song.album}
                                        onError={e => { e.target.style.display = 'none'; }}
                                    />
                                    <FiMusic size={14} className="home-track-art-fallback" />
                                </div>
                                <div className="home-track-info">
                                    <span className="home-track-title">{song.title}</span>
                                    <span className="home-track-meta">{song.artist}</span>
                                </div>
                                <span className="home-track-album">{song.album}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && songs.length === 0 && (
                <div className="home-empty">
                    <FiDownload size={40} className="home-empty-icon" />
                    <p>Your library is empty.</p>
                    <button onClick={() => navigate('/results')}>
                        <FiSearch size={14} /> Search for songs
                    </button>
                </div>
            )}

            {/* Preferences popup */}
            {showPrefs && createPortal(
                <div className="home-prefs-overlay" onClick={closePrefs}>
                    <div className="home-prefs-modal" onClick={e => e.stopPropagation()}>
                        <div className="home-prefs-header">
                            <span className="home-prefs-title"><FiSliders size={14} /> Home Preferences</span>
                            <button className="home-prefs-close" onClick={closePrefs}><FiX size={14} /></button>
                        </div>
                        <div className="home-prefs-body">
                            <SliderRow label="Recently Added Albums" field="recentAlbums" min={3} max={30} />
                            <SliderRow label="Recent Tracks" field="recentTracks" min={3} max={30} />
                            <SliderRow label="Sidebar Artists" field="sidebarArtists" min={3} max={25} />
                        </div>
                        <div className="home-prefs-footer">
                            <button className="home-prefs-save" onClick={savePrefs}>Save</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Home;
