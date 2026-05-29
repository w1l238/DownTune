import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiCheck, FiMusic, FiSearch, FiX, FiClock, FiSettings, FiUser, FiDisc } from 'react-icons/fi';
import { useDownloadTrack } from '../hooks/useDownloadTrack';
import { API_BASE_URL } from '../config';
import MobileSearchBar from '../components/MobileSearchBar';
import './css/Results.css';

const HISTORY_KEY = 'search_history';
const SESSION_KEY = 'results_session';
const MAX_HISTORY = 50;
const HISTORY_LIMIT_KEY = 'history_display_limit';

const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
};

const loadHistoryLimit = () => {
    const v = parseInt(localStorage.getItem(HISTORY_LIMIT_KEY) || '20', 10);
    return Math.min(Math.max(v, 5), 50);
};

const saveHistory = (query) => {
    const prev = loadHistory().filter(q => q !== query);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([query, ...prev].slice(0, MAX_HISTORY)));
};

const emptyAllResults = () => ({
    tracks: { items: [], next: null, previous: null },
    artists: [],
    albums: [],
});

const Results = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const searchBarRef = useRef(null);
    const prefsRef = useRef(null);

    const getInitialState = () => {
        if (location.state?.results) {
            // Pre-fetched results (sidebar search — tracks only, wrap into allResults shape)
            const ar = emptyAllResults();
            ar.tracks = location.state.results;
            return { query: location.state.query || '', allResults: ar };
        }
        if (location.state?.query) {
            sessionStorage.removeItem(SESSION_KEY);
            return { query: location.state.query, allResults: emptyAllResults() };
        }
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Support legacy format: { query, results } where results = tracks object
                if (parsed.allResults) return parsed;
                if (parsed.results) {
                    const ar = emptyAllResults();
                    ar.tracks = parsed.results;
                    return { query: parsed.query, allResults: ar };
                }
            }
        } catch { /* ignore */ }
        return { query: '', allResults: emptyAllResults() };
    };

    const init = getInitialState();
    const [query, setQuery] = useState(init.query);
    const [allResults, setAllResults] = useState(init.allResults);
    const [results, setResults] = useState(init.allResults.tracks); // tracks alias for pagination
    const [activeTab, setActiveTab] = useState('songs');
    const [library, setLibrary] = useState([]);
    const [history, setHistory] = useState(loadHistory);
    const [historyLimit, setHistoryLimit] = useState(loadHistoryLimit);
    const [showHistoryPrefs, setShowHistoryPrefs] = useState(false);
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

    const fetchLibrary = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library`);
            if (res.ok) setLibrary(await res.json());
        } catch { /* silently fail */ }
    };

    const { downloading, handleDownload } = useDownloadTrack(fetchLibrary);

    useEffect(() => {
        document.title = 'Search — DownTune';
        fetchLibrary();
        if (location.state?.query && !location.state?.results) {
            doSearch(location.state.query);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (location.state?.results) {
            const ar = emptyAllResults();
            ar.tracks = location.state.results;
            setAllResults(ar);
            setResults(location.state.results);
            setQuery(location.state.query || '');
        }
    }, [location.state]);

    useEffect(() => {
        if (allResults.tracks.items.length > 0 || allResults.artists.length > 0 || allResults.albums.length > 0) {
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query, allResults }));
            } catch { /* ignore */ }
        }
    }, [allResults, query]);

    useEffect(() => {
        const canvas = document.querySelector('.canvas');
        if (!canvas) return;
        let lastY = 0;
        const onScroll = () => {
            const y = canvas.scrollTop;
            if (searchBarRef.current) {
                searchBarRef.current.classList.toggle('header-hidden', y > lastY && y > 50);
            }
            lastY = y;
        };
        canvas.addEventListener('scroll', onScroll, { passive: true });
        return () => canvas.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!showHistoryPrefs) return;
        const onClickOutside = (e) => {
            if (prefsRef.current && !prefsRef.current.contains(e.target))
                setShowHistoryPrefs(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [showHistoryPrefs]);

    const doSearch = async (q) => {
        const trimmed = (q || query).trim();
        if (!trimmed) return;
        const limit = localStorage.getItem('spotify_results_limit') || 20;
        try {
            const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}&type=all`);
            if (res.ok) {
                const data = await res.json();
                // data = { tracks, artists, albums }
                setAllResults(data);
                setResults(data.tracks);
                setQuery(trimmed);
                saveHistory(trimmed);
                setHistory(loadHistory());
                if (inputRef.current) inputRef.current.blur();
                // Switch to songs tab if it was on artists/albums and there are no results there
                setActiveTab(prev => {
                    if (prev === 'artists' && data.artists.length === 0) return 'songs';
                    if (prev === 'albums'  && data.albums.length  === 0) return 'songs';
                    return prev;
                });
            }
        } catch {
            // showNotification not available here; fail silently or use a toast if needed
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        doSearch();
    };

    const clearResults = () => {
        setAllResults(emptyAllResults());
        setResults({ items: [], next: null, previous: null });
        setQuery('');
        setActiveTab('songs');
        sessionStorage.removeItem(SESSION_KEY);
        if (inputRef.current) inputRef.current.focus();
    };

    const removeHistory = (item, e) => {
        e.stopPropagation();
        const updated = loadHistory().filter(q => q !== item);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        setHistory(updated);
    };

    const isTrackDownloaded = (track) =>
        library.some(song =>
            song.title.toLowerCase() === track.name.toLowerCase() &&
            track.artists.some(a => song.artist.toLowerCase().includes(a.name.toLowerCase()))
        );

    const fetchPage = async (url) => {
        if (!url) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/proxy?url=${encodeURIComponent(url)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
                setAllResults(prev => ({ ...prev, tracks: data }));
            }
        } catch { /* silently fail */ }
    };

    const hasResults = results.items.length > 0;
    const hasAnyResults = hasResults || allResults.artists.length > 0 || allResults.albums.length > 0;
    const isMobile = windowWidth <= 768;
    const displayHistory = history.slice(0, isMobile ? 10 : historyLimit);

    const TABS = [
        { id: 'songs',   label: 'Songs',   count: results.items.length },
        { id: 'artists', label: 'Artists', count: allResults.artists.length },
        { id: 'albums',  label: 'Albums',  count: allResults.albums.length },
    ];

    return (
        <div className="results-wrap">

            {/* Search bar */}
            <form className="results-search" onSubmit={handleSubmit} ref={searchBarRef}>
                <FiSearch size={16} className="results-search-icon" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search for songs, artists, albums…"
                    autoComplete="off"
                />
                {(query || hasResults) && (
                    <button type="button" className="results-search-clear" onClick={clearResults} title="Clear">
                        <FiX size={14} />
                    </button>
                )}
                <button type="submit" className="results-search-btn">
                    Search
                </button>
            </form>

            {/* Tab bar — only when any results exist */}
            {hasAnyResults && (
                <div className="results-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`results-tab${activeTab === tab.id ? ' active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            {tab.count > 0 && <span className="results-tab-badge">{tab.count}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* History chips — shown only when no results */}
            {!hasAnyResults && history.length > 0 && (
                <div className="results-history">
                    <div className="results-history-label">
                        <FiClock size={12} /> Recent searches
                        <div className="results-history-prefs-wrap" ref={prefsRef}>
                            <button
                                type="button"
                                className="results-history-prefs-btn"
                                onClick={() => setShowHistoryPrefs(p => !p)}
                                title="History preferences"
                            >
                                <FiSettings size={11} />
                            </button>
                            {showHistoryPrefs && (
                                <div className="results-history-prefs-popover">
                                    <span className="prefs-popover-label">
                                        Show up to <strong>{historyLimit}</strong> recent searches
                                    </span>
                                    <input
                                        type="range"
                                        min={5}
                                        max={50}
                                        step={5}
                                        value={historyLimit}
                                        onChange={e => {
                                            const v = parseInt(e.target.value, 10);
                                            setHistoryLimit(v);
                                            localStorage.setItem(HISTORY_LIMIT_KEY, String(v));
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="results-history-chips">
                        {displayHistory.map(item => (
                            <div key={item} className="results-history-chip" onClick={() => { setQuery(item); doSearch(item); }}>
                                <span>{item}</span>
                                <button
                                    type="button"
                                    className="chip-remove"
                                    onClick={(e) => removeHistory(item, e)}
                                    title="Remove"
                                >
                                    <FiX size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Songs tab */}
            {activeTab === 'songs' && (
                <div className="results-grid">
                    {hasResults ? (
                        results.items.map((track) => {
                            const downloaded = isTrackDownloaded(track);
                            const isDownloading = downloading[track.id];
                            return (
                                <div key={track.id} className="track-row">
                                    <div className="track-art">
                                        {track.album.images[1]?.url || track.album.images[0]?.url ? (
                                            <img
                                                src={track.album.images[1]?.url || track.album.images[0]?.url}
                                                alt={track.album.name}
                                            />
                                        ) : (
                                            <FiMusic size={22} />
                                        )}
                                    </div>
                                    <div className="track-info">
                                        <span className="track-name">{track.name}</span>
                                        <span className="track-meta">{track.artists.map(a => a.name).join(', ')}</span>
                                        <span className="track-album">{track.album.name}</span>
                                    </div>
                                    <button
                                        className={`track-dl-btn ${downloaded ? 'downloaded' : ''}`}
                                        onClick={() => !downloaded && !isDownloading && handleDownload(track)}
                                        disabled={isDownloading || downloaded}
                                    >
                                        {isDownloading ? (
                                            <><FiRefreshCw className="spin" size={14} /><span className="dl-btn-label"> Downloading</span></>
                                        ) : downloaded ? (
                                            <><FiCheck size={14} /><span className="dl-btn-label"> Downloaded</span></>
                                        ) : (
                                            <><span className="dl-btn-icon">↓</span><span className="dl-btn-label"> Download</span></>
                                        )}
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        !history.length && <p className="results-empty">Search for a song to get started.</p>
                    )}
                </div>
            )}

            {/* Artists tab */}
            {activeTab === 'artists' && (
                <div className="results-cards-grid">
                    {allResults.artists.length > 0 ? allResults.artists.map(artist => (
                        <div
                            key={artist.id}
                            className="result-artist-card"
                            onClick={() => navigate(`/search/artist/${artist.id}`)}
                        >
                            <div className="result-card-art">
                                {artist.pictureUrl
                                    ? <img src={artist.pictureUrl} alt={artist.name} />
                                    : <FiUser size={32} />}
                            </div>
                            <div className="result-card-info">
                                <span className="result-card-name">{artist.name}</span>
                                {artist.albumCount != null && (
                                    <span className="result-card-meta">{artist.albumCount} albums</span>
                                )}
                                {artist.fanCount != null && (
                                    <span className="result-card-sub">{artist.fanCount.toLocaleString()} fans</span>
                                )}
                            </div>
                        </div>
                    )) : (
                        <p className="results-empty">No artists found.</p>
                    )}
                </div>
            )}

            {/* Albums tab */}
            {activeTab === 'albums' && (
                <div className="results-cards-grid">
                    {allResults.albums.length > 0 ? allResults.albums.map(album => (
                        <div
                            key={album.id}
                            className="result-album-card"
                            onClick={() => navigate(`/search/album/${album.id}`)}
                        >
                            <div className="result-card-art">
                                {album.coverUrl
                                    ? <img src={album.coverUrl} alt={album.title} />
                                    : <FiDisc size={32} />}
                            </div>
                            <div className="result-card-info">
                                <span className="result-card-name">{album.title}</span>
                                <span className="result-card-meta">{album.artist}</span>
                                <span className="result-card-sub">
                                    {[album.releaseDate?.substring(0, 4), album.trackCount ? `${album.trackCount} tracks` : null]
                                        .filter(Boolean).join(' · ')}
                                </span>
                            </div>
                        </div>
                    )) : (
                        <p className="results-empty">No albums found.</p>
                    )}
                </div>
            )}

            {/* Pagination — songs tab only */}
            {activeTab === 'songs' && hasResults && (
                <div className="results-pagination">
                    <button onClick={() => fetchPage(results.previous)} disabled={!results.previous}>
                        Previous
                    </button>
                    <button onClick={() => fetchPage(results.next)} disabled={!results.next}>
                        Next
                    </button>
                </div>
            )}

            <MobileSearchBar
                value={query}
                onChange={e => setQuery(e.target.value)}
                onSubmit={handleSubmit}
                placeholder="Search songs, artists, albums…"
                buttonLabel="Search"
            />
        </div>
    );
};

export default Results;
