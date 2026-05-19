import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FiDownload, FiRefreshCw, FiCheck, FiMusic, FiSearch, FiX, FiClock, FiSettings } from 'react-icons/fi';
import { useDownloads } from '../contexts/DownloadContext';
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

const Results = () => {
    const location = useLocation();
    const { addDownload, updateDownload, showNotification } = useDownloads();
    const inputRef = useRef(null);
    const searchBarRef = useRef(null);
    const prefsRef = useRef(null);

    const getInitialState = () => {
        // Navigated with pre-fetched results (e.g. sidebar search)
        if (location.state?.results) {
            return { query: location.state.query || '', results: location.state.results };
        }
        // Navigated with only a query (e.g. home page search) — ignore session, will auto-search
        if (location.state?.query) {
            sessionStorage.removeItem(SESSION_KEY);
            return { query: location.state.query, results: { items: [], next: null, previous: null } };
        }
        // Returning to the page — restore session
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return { query: '', results: { items: [], next: null, previous: null } };
    };

    const init = getInitialState();
    const [query, setQuery] = useState(init.query);
    const [results, setResults] = useState(init.results);
    const [downloading, setDownloading] = useState({});
    const [library, setLibrary] = useState([]);
    const [history, setHistory] = useState(loadHistory);
    const [historyLimit, setHistoryLimit] = useState(loadHistoryLimit);
    const [showHistoryPrefs, setShowHistoryPrefs] = useState(false);
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

    useEffect(() => {
        document.title = 'Search — DownTune';
        fetchLibrary();
        // Auto-search when navigated with a query but no pre-fetched results
        if (location.state?.query && !location.state?.results) {
            doSearch(location.state.query);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (location.state?.results) {
            setResults(location.state.results);
            setQuery(location.state.query || '');
        }
    }, [location.state]);

    useEffect(() => {
        if (results.items.length > 0) {
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query, results }));
            } catch { /* ignore */ }
        }
    }, [results, query]);

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

    const fetchLibrary = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library`);
            if (res.ok) setLibrary(await res.json());
        } catch { /* silently fail */ }
    };

    const doSearch = async (q) => {
        const trimmed = (q || query).trim();
        if (!trimmed) return;
        const limit = localStorage.getItem('spotify_results_limit') || 20;
        try {
            const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
                setQuery(trimmed);
                saveHistory(trimmed);
                setHistory(loadHistory());
                if (inputRef.current) inputRef.current.blur();
            }
        } catch {
            showNotification('Search failed.', 'error');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        doSearch();
    };

    const clearResults = () => {
        setResults({ items: [], next: null, previous: null });
        setQuery('');
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

    const handleDownload = async (track) => {
        const id = track.id;
        setDownloading(prev => ({ ...prev, [id]: true }));

        const trackDetails = {
            trackName: track.name,
            artistName: track.artists.map(a => a.name).join(', '),
            albumName: track.album.name,
            albumArtUrl: track.album.images[0]?.url,
            year: track.album.release_date?.substring(0, 4),
            trackNumber: track.trackNumber,
            isYoutube: track.isYoutube,
            isDeezer: track.isDeezer,
            url: track.url,
        };

        addDownload({
            id,
            trackName: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumArtUrl: track.album.images[0]?.url,
            status: 'queued',
        });
        updateDownload(id, { status: 'downloading', progress: 5 });

        const controller = new AbortController();
        // 10 min timeout — yt-dlp can be slow on long tracks
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

        try {
            const res = await fetch(`${API_BASE_URL}/download-song`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackDetails),
                signal: controller.signal,
            });
            const data = await res.json();
            if (res.ok) {
                updateDownload(id, { status: 'done', progress: 100 });
                showNotification(
                    data.status === 'exists' ? 'Song already downloaded' : 'Download successful!',
                    data.status === 'exists' ? 'info' : 'success',
                );
                fetchLibrary();
            } else {
                updateDownload(id, { status: 'error', progress: 0 });
                showNotification(data.error || 'Download failed.', 'error');
            }
        } catch (err) {
            updateDownload(id, { status: 'error', progress: 0 });
            showNotification(
                err?.name === 'AbortError' ? 'Download timed out after 10 minutes.' : 'Download failed.',
                'error',
            );
        } finally {
            clearTimeout(timeoutId);
            setDownloading(prev => ({ ...prev, [id]: false }));
        }
    };

    const fetchPage = async (url) => {
        if (!url) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/proxy?url=${encodeURIComponent(url)}`);
            if (res.ok) setResults(await res.json());
        } catch { /* silently fail */ }
    };

    const hasResults = results.items.length > 0;
    const isMobile = windowWidth <= 768;
    const displayHistory = history.slice(0, isMobile ? 10 : historyLimit);

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

            {/* History chips — shown only when no results */}
            {!hasResults && history.length > 0 && (
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

            {/* Results list */}
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
                                        <><FiDownload size={14} /><span className="dl-btn-label"> Download</span></>
                                    )}
                                </button>
                            </div>
                        );
                    })
                ) : (
                    !history.length && <p className="results-empty">Search for a song to get started.</p>
                )}
            </div>

            {hasResults && (
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
