import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiSearch, FiHeart } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import './css/Albums.css';

const Albums = () => {
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [animationsDone, setAnimationsDone] = useState(false);
    const animationTimer = useRef(null);
    const headerRef = useRef(null);
    const navigate = useNavigate();

    const fetchSongs = useCallback((initial = false) => {
        fetch(`${API_BASE_URL}/api/library`)
            .then(res => res.json())
            .then(data => {
                setSongs(data);
                if (initial) {
                    setLoading(false);
                    animationTimer.current = setTimeout(() => setAnimationsDone(true), 1500);
                }
            })
            .catch(() => { if (initial) setLoading(false); });
    }, []);

    useEffect(() => {
        document.title = 'Albums — DownTune';
        fetchSongs(true);
        return () => { if (animationTimer.current) clearTimeout(animationTimer.current); };
    }, []);

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

    const albums = useMemo(() => {
        const map = {};
        for (const song of songs) {
            const key = `${song.album || 'Unknown Album'}__${song.artist || 'Unknown Artist'}`;
            if (!map[key]) {
                map[key] = {
                    name: song.album || 'Unknown Album',
                    artist: song.artist || 'Unknown Artist',
                    artId: song.id,
                    songs: [],
                };
            }
            map[key].songs.push(song);
        }
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [songs]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return albums
            .filter(a => !showFavoritesOnly || a.songs.some(s => s.isLiked))
            .filter(a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
    }, [albums, searchQuery, showFavoritesOnly]);

    if (loading) return <div className="albums-empty">Loading albums…</div>;

    return (
        <div className="albums-wrap">
            <div className="page-header" ref={headerRef}>
                <h2>Albums</h2>
                <div className="page-header-controls">
                    <div className="page-search">
                        <FiSearch size={14} style={{ marginRight: '0.45rem', opacity: 0.6 }} />
                        <input
                            type="text"
                            placeholder="Search albums…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
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
                <p className="albums-empty">
                    {songs.length === 0 ? 'No albums in library. Download some songs first.' : 'No albums match your search.'}
                </p>
            ) : (
                <div className="albums-grid">
                    {filtered.map((album, index) => (
                        <div
                            key={`${album.name}__${album.artist}`}
                            className={`albums-card${!animationsDone ? ' fade-in' : ''}`}
                            style={{ animationDelay: !animationsDone ? `${Math.min(index * 0.04, 0.5)}s` : '0s' }}
                            onClick={() => navigate(`/album/${encodeURIComponent(album.name)}`)}
                        >
                            <div className="albums-art">
                                <img
                                    src={`${API_BASE_URL}/api/files/${encodeURIComponent(album.artId)}/art`}
                                    alt={album.name}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            </div>
                            <h3 title={album.name}>{album.name}</h3>
                            <p title={album.artist}>{album.artist}</p>
                            <div className="meta-row">
                                <span>{album.songs.length} songs</span>
                                {album.songs.some(s => s.isLiked) && (
                                    <FiHeart size={11} fill="white" style={{ opacity: 0.55 }} />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Albums;
