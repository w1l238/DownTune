import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    FiSearch, FiMusic, FiSettings, FiHome, FiDownload,
    FiChevronLeft, FiChevronRight, FiChevronDown, FiDisc, FiUsers, FiLoader, FiCheck, FiX, FiRefreshCw
} from 'react-icons/fi';
import { API_BASE_URL } from '../config';
import { useDownloads } from '../contexts/DownloadContext';
import './css/Sidebar.css';

const formatBytes = (bytes) => {
    if (bytes === null) return null;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const getArtistsLimit = () => {
    try { return JSON.parse(localStorage.getItem('home_prefs') || '{}').sidebarArtists ?? 10; }
    catch { return 10; }
};

const Sidebar = ({ collapsed, onToggleCollapse }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { lastCompletedAt, downloads, removeDownload } = useDownloads();
    const [query, setQuery] = useState('');
    const [serverOnline, setServerOnline] = useState(false);
    const [libraryTree, setLibraryTree] = useState([]);
    const [expandedArtists, setExpandedArtists] = useState({});
    const [artistsLimit, setArtistsLimit] = useState(getArtistsLimit);
    const [storageBytes, setStorageBytes] = useState(null);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [scanStatus, setScanStatus] = useState('idle');
    const scanResetTimer = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const check = () => setKeyboardOpen(vv.height < window.innerHeight * 0.75);
        vv.addEventListener('resize', check);
        return () => vv.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        const handler = () => setArtistsLimit(getArtistsLimit());
        window.addEventListener('home-prefs-saved', handler);
        return () => window.removeEventListener('home-prefs-saved', handler);
    }, []);

    const checkServerStatus = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/config`);
            setServerOnline(res.ok);
        } catch {
            setServerOnline(false);
        }
    };

    const loadStorageSize = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library/storage`);
            if (res.ok) {
                const { bytes } = await res.json();
                setStorageBytes(bytes);
            }
        } catch { /* silently fail */ }
    };

    const loadLibraryTree = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library`);
            if (!res.ok) return;
            const songs = await res.json();
            const artistMap = {};
            for (const song of songs) {
                const artist = song.artist || 'Unknown Artist';
                const album = song.album || 'Unknown Album';
                if (!artistMap[artist]) artistMap[artist] = {};
                if (!artistMap[artist][album]) artistMap[artist][album] = 0;
                artistMap[artist][album]++;
            }
            const tree = Object.entries(artistMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([artist, albums]) => ({
                    artist,
                    albums: Object.entries(albums).sort(([a], [b]) => a.localeCompare(b))
                }));
            setLibraryTree(tree);
        } catch {
            // silently fail
        }
    };

    const handleScan = async () => {
        if (scanStatus === 'loading') return;
        setScanStatus('loading');
        if (scanResetTimer.current) clearTimeout(scanResetTimer.current);
        try {
            const res = await fetch(`${API_BASE_URL}/api/library/scan`);
            await new Promise(r => setTimeout(r, 1000));
            if (res.ok) {
                const data = await res.json();
                loadLibraryTree();
                loadStorageSize();
                setScanStatus('success');
                window.dispatchEvent(new CustomEvent('library-scanned', { detail: data }));
            } else {
                setScanStatus('error');
            }
        } catch {
            setScanStatus('error');
        }
        scanResetTimer.current = setTimeout(() => setScanStatus('idle'), 3000);
    };

    useEffect(() => {
        checkServerStatus();
        loadLibraryTree();
        loadStorageSize();
    }, []);

    useEffect(() => {
        if (!lastCompletedAt) return;
        if (localStorage.getItem('auto_refresh_library') === 'false') return;
        setScanStatus('loading');
        if (scanResetTimer.current) clearTimeout(scanResetTimer.current);
        Promise.all([loadLibraryTree(), loadStorageSize()]).then(() => {
            setScanStatus('success');
            scanResetTimer.current = setTimeout(() => setScanStatus('idle'), 3000);
        });
    }, [lastCompletedAt]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (location.pathname === '/results' && !location.state?.fromSidebar) {
            setQuery('');
        }
    }, [location]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        const limit = localStorage.getItem('spotify_results_limit') || 20;
        try {
            const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (res.ok) {
                const data = await res.json();
                navigate('/results', { state: { results: data, query, fromSidebar: true } });
                if (inputRef.current) inputRef.current.blur();
            }
        } catch {
            // handled in toast on the results page
        }
    };

    const isOn = (path) => location.pathname === path;

    const toggleArtist = (artist) => {
        setExpandedArtists(prev => ({ ...prev, [artist]: !prev[artist] }));
    };

    const navLinks = [
        { to: '/', label: 'Home', icon: <FiHome /> },
        { to: '/results', label: 'Search', icon: <FiSearch /> },
        { to: '/library', label: 'Library', icon: <FiMusic /> },
        { to: '/albums', label: 'Albums', icon: <FiDisc /> },
        { to: '/artists', label: 'Artists', icon: <FiUsers /> },
        { to: '/queue', label: 'Queue', icon: <FiDownload /> },
        { to: '/settings', label: 'Settings', icon: <FiSettings /> },
    ];

    // Mobile nav shows 5 most-used
    const mobileLinks = [
        { to: '/', label: 'Home', icon: <FiHome /> },
        { to: '/results', label: 'Search', icon: <FiSearch /> },
        { to: '/library', label: 'Library', icon: <FiMusic /> },
        { to: '/queue', label: 'Queue', icon: <FiDownload /> },
        { to: '/settings', label: 'Settings', icon: <FiSettings /> },
    ];

    const dlActive = downloads.find(d => d.status === 'downloading');
    const dlQueued = downloads.filter(d => d.status === 'queued');
    const dlDone = downloads.filter(d => d.status === 'done');
    const dlCurrent = dlActive || dlQueued[0] || dlDone[0];
    const dlIsDone = !dlActive && dlQueued.length === 0;
    const dlTotal = downloads.length;
    const dlPosition = dlDone.length + (dlActive ? 1 : 0);

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}${downloads.length > 0 ? ' has-download' : ''}${keyboardOpen ? ' keyboard-open' : ''}`}>
            {/* Header */}
            <div className="sidebar-head">
                <img src="/tunefall-logo.svg" alt="DownTune" className="sidebar-logo" />
                {!collapsed && (
                    <div className="meta">
                        <div className="name">DownTune</div>
                        <div className="build">v1.1</div>
                    </div>
                )}
                <button
                    className="sidebar-collapse"
                    onClick={onToggleCollapse}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
                </button>
            </div>

            {/* Quick search */}
            <form className="side-search" onSubmit={handleSearch}>
                <FiSearch size={13} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search…"
                />
            </form>

            {/* Sync / Rescan button */}
            <div className="side-sync-wrap">
                <button
                    className={`side-sync-btn ${scanStatus}`}
                    onClick={handleScan}
                    disabled={scanStatus === 'loading'}
                    title="Rescan Library"
                >
                    {scanStatus === 'loading' ? <FiRefreshCw className="spin" size={14} /> :
                     scanStatus === 'success' ? <FiCheck size={14} /> :
                     scanStatus === 'error' ? <FiX size={14} /> :
                     <FiRefreshCw size={14} />}
                    <span className="side-sync-label">Rescan Library</span>
                </button>
            </div>

            {/* Browse nav */}
            {!collapsed && <div className="sidebar-section-h">Browse</div>}
            <div className="side-section">
                {navLinks.map(({ to, label, icon }) => (
                    <Link
                        key={to}
                        to={to}
                        className={`side-link ${isOn(to) ? 'on' : ''}`}
                        title={collapsed ? label : undefined}
                    >
                        {icon}
                        <span className="side-link-label">{label}</span>
                    </Link>
                ))}
            </div>

            {/* Library tree */}
            {!collapsed && libraryTree.length > 0 && (
                <>
                    <div className="sidebar-section-h">Library</div>
                    <div className="side-tree">
                        {libraryTree.slice(0, artistsLimit).map(({ artist, albums }) => (
                            <div key={artist} className="tree-artist">
                                <div
                                    className="tree-row"
                                    onClick={() => toggleArtist(artist)}
                                >
                                    <FiChevronDown
                                        className={`twirl ${expandedArtists[artist] ? 'open' : ''}`}
                                        size={12}
                                    />
                                    <span className="label">{artist}</span>
                                    <span className="count">{albums.length}</span>
                                </div>
                                {expandedArtists[artist] && (
                                    <div className="tree-children">
                                        {albums.map(([album, count]) => (
                                            <div
                                                key={album}
                                                className="tree-row"
                                                onClick={() => navigate(`/album/${encodeURIComponent(album)}`)}
                                            >
                                                <span className="label">{album}</span>
                                                <span className="count">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Footer */}
            <div className="side-foot">
                {!collapsed && storageBytes !== null && (
                    <div className="stat">
                        <span>Downloads</span>
                        <b>{formatBytes(storageBytes)}</b>
                    </div>
                )}
                <div className="server-status">
                    <span className={`status-dot ${serverOnline ? 'online' : ''}`} />
                    {!collapsed && <span>{serverOnline ? 'Server online' : 'Server offline'}</span>}
                </div>
            </div>

            {/* Expand button — only visible when collapsed */}
            {collapsed && (
                <button
                    className="sidebar-expand-btn"
                    onClick={onToggleCollapse}
                    title="Expand sidebar"
                >
                    <FiChevronRight size={16} />
                </button>
            )}

            {/* Mobile download progress bar */}
            {downloads.length > 0 && dlCurrent && (
                <div className="mobile-download-bar">
                    <div className="mobile-dl-row">
                        <div className={`mobile-dl-icon${dlIsDone ? ' done' : ''}`}>
                            {dlIsDone
                                ? <FiCheck size={13} />
                                : <FiLoader size={13} className="spin" />
                            }
                        </div>
                        <div className="mobile-dl-meta">
                            {dlTotal > 1 && (
                                <span className="mobile-dl-count">
                                    {dlIsDone ? `${dlTotal} of ${dlTotal}` : `${dlPosition} of ${dlTotal}`} songs
                                </span>
                            )}
                            <span className="mobile-dl-name">{dlCurrent.trackName}</span>
                        </div>
                        {!dlIsDone && (
                            <button
                                className="mobile-dl-cancel"
                                onClick={() => removeDownload(dlCurrent.id)}
                                title="Cancel"
                            >
                                <FiX size={12} />
                            </button>
                        )}
                    </div>
                    <div className="mobile-dl-bar">
                        <div
                            className="mobile-dl-fill"
                            style={{ width: `${dlActive?.progress ?? (dlIsDone ? 100 : 0)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Mobile bottom nav */}
            <div className="mobile-nav-section">
                {mobileLinks.map(({ to, label, icon }) => (
                    <Link
                        key={to}
                        to={to}
                        className={`side-link mobile-nav ${isOn(to) ? 'on' : ''}`}
                    >
                        {icon}
                        <span>{label}</span>
                    </Link>
                ))}
            </div>
        </aside>
    );
};

export default Sidebar;
