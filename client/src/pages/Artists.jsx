import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiArrowLeft, FiSearch, FiHeart, FiGrid, FiList } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getSpeedOption, applySongLayout } from '../utils/appearance';
import MobileSearchBar from '../components/MobileSearchBar';
import './css/Artists.css';
import './css/Albums.css';

const Artists = () => {
    const speedOpt = getSpeedOption(localStorage.getItem('app_animation_speed') || 'normal');
    const instant = speedOpt.staggerDelay === 0;
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [animationsDone, setAnimationsDone] = useState(instant);
    const [songLayout, setSongLayout] = useState(() => localStorage.getItem('artists_layout') || 'grid');
    const layoutClicked = useRef(false);
    const animationTimer = useRef(null);
    const headerRef = useRef(null);
    const navigate = useNavigate();

    const triggerAnimation = useCallback(() => {
        if (instant) return;
        setAnimationsDone(false);
        if (animationTimer.current) clearTimeout(animationTimer.current);
        animationTimer.current = setTimeout(() => setAnimationsDone(true), 1500);
    }, [instant]);

    const fetchSongs = useCallback((initial = false) => {
        fetch(`${API_BASE_URL}/api/library`)
            .then(res => res.json())
            .then(data => {
                setSongs(data);
                if (initial) {
                    setLoading(false);
                    triggerAnimation();
                }
            })
            .catch(() => { if (initial) setLoading(false); });
    }, [triggerAnimation]);

    useEffect(() => {
        document.title = 'Artists — DownTune';
        applySongLayout(songLayout);
        fetchSongs(true);
        return () => { if (animationTimer.current) clearTimeout(animationTimer.current); };
    }, []);

    const toggleLayout = () => {
        layoutClicked.current = true;
        const next = songLayout === 'list' ? 'grid' : 'list';
        setSongLayout(next);
        applySongLayout(next);
        localStorage.setItem('artists_layout', next);
    };

    useAutoRefresh(fetchSongs);

    useEffect(() => {
        const canvas = document.querySelector('.canvas');
        if (!canvas) return;
        let lastY = 0;
        const onScroll = () => {
            const y = canvas.scrollTop;
            if (headerRef.current) {
                headerRef.current.classList.toggle('header-hidden', y > lastY && y > 50);
            }
            lastY = y;
        };
        canvas.addEventListener('scroll', onScroll, { passive: true });
        return () => canvas.removeEventListener('scroll', onScroll);
    }, []);

    const artists = useMemo(() => {
        const map = {};
        for (const song of songs) {
            const artist = song.artist || 'Unknown Artist';
            if (!map[artist]) map[artist] = { name: artist, albums: {}, totalSongs: 0, artId: song.id, hasLiked: false };
            const album = song.album || 'Unknown Album';
            if (!map[artist].albums[album]) map[artist].albums[album] = [];
            map[artist].albums[album].push(song);
            map[artist].totalSongs++;
            if (song.isLiked) map[artist].hasLiked = true;
        }
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [songs]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return artists
            .filter(a => !showFavoritesOnly || a.hasLiked)
            .filter(a => a.name.toLowerCase().includes(q));
    }, [artists, searchQuery, showFavoritesOnly]);

    const initials = (name) => {
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    if (loading) return <div className="artists-empty">Loading artists…</div>;

    if (selectedArtist) {
        const artist = artists.find(a => a.name === selectedArtist);
        const albumList = artist
            ? Object.entries(artist.albums).sort(([a], [b]) => a.localeCompare(b))
            : [];

        return (
            <div className="artist-detail">
                <button className="section-back" onClick={() => { setSelectedArtist(null); triggerAnimation(); }}>
                    <FiArrowLeft size={15} /> Artists
                </button>
                <div className="artist-hero">
                    <div className="artist-portrait">{initials(selectedArtist)}</div>
                    <div>
                        <h2>{selectedArtist}</h2>
                        <p className="meta">{albumList.length} albums · {artist?.totalSongs} songs</p>
                    </div>
                </div>
                <div className="albums-grid">
                    {albumList.map(([albumName, albumSongs], index) => (
                        <div
                            key={albumName}
                            className={`albums-card${!animationsDone ? ' fade-in' : ''}`}
                            style={{ animationDelay: !animationsDone ? `${Math.min(index * speedOpt.staggerDelay, 0.6)}s` : '0s' }}
                            onClick={() => navigate(`/album/${encodeURIComponent(albumName)}`)}
                        >
                            <div className="albums-art">
                                <img
                                    src={`${API_BASE_URL}/api/files/${encodeURIComponent(albumSongs[0].id)}/art`}
                                    alt={albumName}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            </div>
                            <h3 title={albumName}>{albumName}</h3>
                            <div className="meta-row">
                                <span>{albumSongs.length} songs</span>
                                {albumSongs.some(s => s.isLiked) && (
                                    <FiHeart size={11} fill="currentColor" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="artists-wrap">
            <div className="page-header" ref={headerRef}>
                <h2>Artists</h2>
                <div className="page-header-controls">
                    <div className="page-search">
                        <FiSearch size={14} style={{ marginRight: '0.45rem', opacity: 0.6 }} />
                        <input
                            type="text"
                            placeholder="Search artists…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        className="page-icon-btn"
                        onClick={toggleLayout}
                        title={songLayout === 'grid' ? 'Switch to list' : 'Switch to grid'}
                    >
                        <span key={songLayout} className={layoutClicked.current ? 'layout-icon-anim' : ''}>
                            {songLayout === 'grid' ? <FiList size={15} /> : <FiGrid size={15} />}
                        </span>
                    </button>
                    <button
                        className={`page-icon-btn ${showFavoritesOnly ? 'active' : ''}`}
                        onClick={() => setShowFavoritesOnly(f => !f)}
                        title={showFavoritesOnly ? 'Show all' : 'Show favorites only'}
                    >
                        <FiHeart size={15} fill={showFavoritesOnly ? 'white' : 'none'} />
                    </button>
                </div>
            </div>

            {filtered.length === 0 ? (
                <p className="artists-empty">
                    {songs.length === 0
                        ? 'No artists in library. Download some songs first.'
                        : showFavoritesOnly
                        ? 'No favorite artists yet.'
                        : 'No artists match your search.'}
                </p>
            ) : (
                <div className="artist-grid">
                    {filtered.map((artist, index) => (
                        <div
                            key={artist.name}
                            className={`artist-card${!animationsDone ? ' fade-in' : ''}`}
                            style={{ animationDelay: !animationsDone ? `${Math.min(index * speedOpt.staggerDelay, 0.6)}s` : '0s' }}
                            onClick={() => { setSelectedArtist(artist.name); triggerAnimation(); }}
                        >
                            <div className="artist-portrait">{initials(artist.name)}</div>
                            <div className="artist-card-info">
                                <h3 title={artist.name}>{artist.name}</h3>
                                <p>{Object.keys(artist.albums).length} albums</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <MobileSearchBar
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search artists…"
                buttonLabel="Go"
            />
        </div>
    );
};

export default Artists;
