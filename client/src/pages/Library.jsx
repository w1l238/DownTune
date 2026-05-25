import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiGrid, FiList, FiTrash2, FiMusic, FiSearch, FiRefreshCw, FiArrowLeft, FiDisc, FiX, FiCheck, FiEdit, FiHeart, FiMoreVertical, FiUsers } from 'react-icons/fi';
import { LuHeartOff } from 'react-icons/lu';
import toast, { Toaster } from 'react-hot-toast';
import { useInView } from 'react-intersection-observer';
import { API_BASE_URL } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getSpeedOption, applySongLayout } from '../utils/appearance';
import MobileSearchBar from '../components/MobileSearchBar';
import './css/Library.css';
import './css/Albums.css';

const LazyAlbumCard = ({ album, index, animationsDone, staggerDelay, handleAlbumClick, lastUpdate }) => {
    const { ref, inView } = useInView({
        triggerOnce: true, // Only trigger once to load content
        rootMargin: '200px 0px', // Preload content 200px before it comes into view
        threshold: 0
    });

    return (
        <div 
            ref={ref}
            className={`album-card-wrapper ${!animationsDone ? 'fade-in' : ''}`}
            style={{ animationDelay: !animationsDone ? `${Math.min(index * staggerDelay, 0.6)}s` : '0s', minHeight: '250px' }}
        >
            {inView ? (
                <div 
                    className="album-card" 
                    onClick={() => handleAlbumClick(album)}
                >
                    <div className="album-art">
                        <img 
                            src={`${API_BASE_URL}/api/files/${encodeURIComponent(album.artId)}/art?t=${lastUpdate}`} 
                            alt={album.name}
                            onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/svg+xml;base64,...'; e.target.style.display = 'none'; }}
                            onLoad={(e) => e.target.style.display = 'block'}
                        />
                        <FiDisc style={{ display: 'none', fontSize: '3rem', opacity: 0.5 }} /> 
                    </div>
                    <div className="album-info">
                        <h3 title={album.name}>{album.name}</h3>
                        <p title={album.artist}>{album.artist}</p>
                        <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{album.songs.length} songs</p>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const Library = () => {
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState(sessionStorage.getItem('library_search_query') || '');
    const [view, setView] = useState('albums'); // 'albums' | 'songs'
    const [selectedAlbum, setSelectedAlbum] = useState(null);
    const [deleteModal, setDeleteModal] = useState({ show: false, songId: null, songTitle: '' });
    const [errorModal, setErrorModal] = useState({ show: false, message: '' });
    const [editModal, setEditModal] = useState({ show: false, song: null });
    const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
    const speedOpt = getSpeedOption(localStorage.getItem('app_animation_speed') || 'normal');
    const instant = speedOpt.staggerDelay === 0;
    const [animationsDone, setAnimationsDone] = useState(instant);
    const [songLayout, setSongLayout] = useState(() => localStorage.getItem('lib_layout') || 'grid');
    const [layoutClicked, setLayoutClicked] = useState(false);
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [bulkDeleteModal, setBulkDeleteModal] = useState({ show: false, count: 0 });
    const [showBulkBar, setShowBulkBar] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [menuOpenUpwards, setMenuOpenUpwards] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [backendError, setBackendError] = useState(false);
    const animationTimer = useRef(null);
    const containerRef = useRef(null);
    const headerRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        sessionStorage.setItem('library_search_query', searchQuery);
    }, [searchQuery]);

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


    useEffect(() => {
        document.title = 'Library — DownTune';
        applySongLayout(songLayout);

        const shouldAutoScan = localStorage.getItem('auto_scan_library') === 'true';
        if (shouldAutoScan) {
            handleScan();
        } else {
            fetchLibrary();
        }

        if (!instant) {
            animationTimer.current = setTimeout(() => setAnimationsDone(true), 1500);
        }
        return () => {
            if (animationTimer.current) clearTimeout(animationTimer.current);
            document.body.classList.remove('bulk-bar-showing');
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handler = (e) => {
            if (e.detail && Array.isArray(e.detail)) {
                setSongs(e.detail);
                toast.success('Library updated', { className: 'popup success show' });
            }
        };
        window.addEventListener('library-scanned', handler);
        return () => window.removeEventListener('library-scanned', handler);
    }, []);

    const toggleLayout = () => {
        setLayoutClicked(true);
        const next = songLayout === 'list' ? 'grid' : 'list';
        setSongLayout(next);
        applySongLayout(next);
        localStorage.setItem('lib_layout', next);
    };

    const fetchLibrary = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/library`);
            if (response.ok) {
                const data = await response.json();
                setSongs(data);
                setLastUpdate(Date.now());
                setBackendError(false);
            } else {
                toast.error('Failed to load library');
                setBackendError(true);
            }
        } catch (error) {
            console.error('Error fetching library:', error);
            toast.error('Network error loading library', { id: 'network-error' });
            setBackendError(true);
        } finally {
            setLoading(false);
        }
    };

    useAutoRefresh(fetchLibrary);

    const handleScan = async () => {
        setScanStatus('loading');
        try {
            const response = await fetch(`${API_BASE_URL}/api/library/scan`);
            // Add 1 second artificial delay for better UX
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (response.ok) {
                const data = await response.json();
                setSongs(data);
                toast.success('Library updated', { className: 'popup success show' });
                setScanStatus('success');
            } else {
                const data = await response.json();
                const rawError = data.error || 'Failed to scan library';
                setErrorModal({ 
                    show: true, 
                    message: (
                        <>
                            {rawError}
                            <br /><br />
                            <b>Check backend server status.</b>
                        </>
                    )
                });
                setScanStatus('error');
            }
        } catch (error) {
            console.error('Error scanning library:', error);
            setErrorModal({ 
                show: true, 
                message: (
                    <>
                        Network error scanning library: {error.message}
                        <br /><br />
                        <b>Possible Fix: Check backend server status.</b>
                    </>
                )
            });
            setScanStatus('error');
        } finally {
            setTimeout(() => setScanStatus('idle'), 3000);
        }
    };

    const toggleFavorite = async (song) => {
        try {
            // Optimistic update
            const newIsLiked = !song.isLiked;
            setSongs(songs.map(s => s.id === song.id ? { ...s, isLiked: newIsLiked } : s));

            const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(song.id)}/toggle-favorite`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                // Revert if failed
                setSongs(songs.map(s => s.id === song.id ? { ...s, isLiked: !newIsLiked } : s));
                toast.error('Failed to update favorite');
            }
        } catch (error) {
             setSongs(songs.map(s => s.id === song.id ? { ...s, isLiked: !song.isLiked } : s));
             console.error('Error toggling favorite:', error);
        }
    };

    const handleLikeAlbum = async (albumName) => {
        const albumSongs = songs.filter(s => s.album === albumName);
        if (albumSongs.length === 0) return;

        // If ALL songs are liked, we UNLIKE all. Otherwise, we LIKE all.
        const allLiked = albumSongs.every(s => s.isLiked);
        const shouldLike = !allLiked;
        const ids = albumSongs.map(s => s.id);

        try {
            // Optimistic update
            setSongs(songs.map(s => {
                if (s.album === albumName) {
                    return { ...s, isLiked: shouldLike };
                }
                return s;
            }));

            const response = await fetch(`${API_BASE_URL}/api/library/bulk/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, shouldLike })
            });

            if (!response.ok) {
                // Revert
                setSongs(songs.map(s => {
                    if (s.album === albumName) {
                        return { ...s, isLiked: !shouldLike }; // simple revert logic might need refinement if mixed state but good enough
                    }
                    return s;
                }));
                toast.error('Failed to update album favorites');
            } else {
                 toast.success(shouldLike ? `Liked all songs in "${albumName}"` : `Unliked all songs in "${albumName}"`);
            }
        } catch (error) {
            console.error('Error liking album:', error);
            // Revert
            setSongs(songs.map(s => {
                if (s.album === albumName) {
                    return { ...s, isLiked: !shouldLike };
                }
                return s;
            }));
        }
    };

    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichedSources, setEnrichedSources] = useState({});

    const needsEnrichment = (song) =>
        !song.lyrics || !song.genre || !song.year || !song.trackNumber ||
        !song.album || song.album === 'Unknown Album' || song.album === 'YouTube Music';

    const handleEnrich = async () => {
        if (!editModal.song) return;
        setIsEnriching(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(editModal.song.id)}/enrich`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { setErrorModal({ show: true, message: data.error || 'Failed to fetch metadata' }); return; }
            if (data.found.length === 0) {
                toast('Nothing new found', { icon: 'ℹ️' });
            } else {
                setEditModal(prev => ({ ...prev, song: { ...prev.song, ...data.enriched } }));
                setEnrichedSources(data.sources || {});
                toast.success(`Found: ${data.found.join(', ')}`);
            }
        } catch (err) {
            setErrorModal({ show: true, message: 'Network error fetching metadata' });
            console.error('Error enriching metadata:', err);
        } finally {
            setIsEnriching(false);
        }
    };

    useEffect(() => { if (!editModal.show) setEnrichedSources({}); }, [editModal.show]);

    const handleDeleteClick = (song) => {
        setDeleteModal({ show: true, songId: song.id, songTitle: song.title });
    };

    const handleEditClick = async (song) => {
        setEditModal({ show: true, song: { ...song, releaseTime: song.releaseTime || song.year } });
        try {
            const q = encodeURIComponent(`${song.artist} ${song.title}`);
            const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
            if (res.ok) {
                const data = await res.json();
                const url = data.results?.[0]?.artworkUrl100?.replace('100x100bb', '600x600bb');
                if (url) setEditModal(prev => ({ ...prev, song: { ...prev.song, artworkUrl: url } }));
            }
        } catch { /* fail silently */ }
    };

    const saveMetadata = async () => {
        const { song } = editModal;
        if (!song) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(song.id)}/metadata`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: song.title,
                    artist: song.artist,
                    album: song.album,
                    trackNumber: song.trackNumber,
                    discNumber: song.discNumber,
                    year: song.year,
                    releaseTime: song.releaseTime,
                    genre: song.genre,
                    comment: song.comment,
                    lyrics: song.lyrics,
                    artworkUrl: song.artworkUrl,
                })
            });

            if (response.ok) {
                toast.success('Metadata updated');
                fetchLibrary(); // Full refresh to sync everything
                setEditModal({ show: false, song: null });
            } else {
                const data = await response.json();
                setErrorModal({ show: true, message: data.error || 'Failed to update metadata' });
            }
        } catch (error) {
            console.error('Error saving metadata:', error);
            setErrorModal({ show: true, message: 'Network error saving metadata' });
        }
    };

    const confirmDelete = async () => {
        if (!deleteModal.songId) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(deleteModal.songId)}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setSongs(songs.filter(s => s.id !== deleteModal.songId));
                toast.success(`Deleted "${deleteModal.songTitle}"`, {
                    style: {
                        background: 'rgba(29, 185, 84, 0.7)',
                        color: 'white',
                        backdropFilter: 'blur(5px)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '1rem',
                    }
                });
                
                // If we deleted the last song in the current album, go back
                if (selectedAlbum) {
                    const remaining = songs.filter(s => s.id !== deleteModal.songId && s.album === selectedAlbum.name);
                    if (remaining.length === 0) {
                        setView('albums');
                        setSelectedAlbum(null);
                    }
                }

            } else {
                const data = await response.json();
                const rawError = data.error || 'Failed to delete song';
                
                let message = rawError;
                if (rawError.includes('EACCES')) {
                    message = (
                        <>
                            {rawError}
                            <br /><br />
                            <b>Fix: Check user permissions on the folder or file of the song being deleted.</b>
                        </>
                    );
                }
                
                setErrorModal({ show: true, message });
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            setErrorModal({ show: true, message: 'Network error deleting song' });
        } finally {
            setDeleteModal({ show: false, songId: null, songTitle: '' });
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Group songs by Album
    const albums = useMemo(() => {
        const groups = {};
        songs.forEach(song => {
            const albumName = song.album || 'Unknown Album';
            if (!groups[albumName]) {
                groups[albumName] = {
                    name: albumName,
                    artist: song.artist,
                    songs: [],
                    artId: song.id // Use first song ID to fetch art
                };
            }
            groups[albumName].songs.push(song);
        });
        return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
    }, [songs]);

    // Filter Logic
    const filteredContent = useMemo(() => {
        const query = searchQuery.toLowerCase();
        
        if (view === 'albums') {
            let filteredAlbums = albums;
            if (showFavoritesOnly) {
                filteredAlbums = filteredAlbums.filter(album => album.songs.some(s => s.isLiked));
            }
            return filteredAlbums.filter(album => 
                album.name.toLowerCase().includes(query) || 
                album.artist.toLowerCase().includes(query)
            );
        } else if (view === 'songs' && selectedAlbum) {
            let albumSongs = songs.filter(s => s.album === selectedAlbum.name);
            if (showFavoritesOnly) {
                albumSongs = albumSongs.filter(s => s.isLiked);
            }
            // Ignore search query in song view as per request
            return albumSongs;
        }
        return [];
    }, [albums, songs, view, selectedAlbum, searchQuery, showFavoritesOnly]);

    const handleAlbumClick = (album) => {
        navigate(`/album/${encodeURIComponent(album.name)}`);
    };

const handleBack = () => {
        if (animationTimer.current) clearTimeout(animationTimer.current);
        if (containerRef.current) containerRef.current.scrollTop = 0;

        setView('albums');
        setSelectedAlbum(null);
        // Removed: setSearchQuery('');
        setSelectedIds([]);
        setIsSelectionMode(false);
        if (!instant) {
            setAnimationsDone(false);
            animationTimer.current = setTimeout(() => setAnimationsDone(true), 1500);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        const currentIds = filteredContent.map(s => s.id);
        const allSelected = currentIds.every(id => selectedIds.includes(id));
        
        if (allSelected) {
            setSelectedIds(selectedIds.filter(id => !currentIds.includes(id)));
        } else {
            setSelectedIds([...new Set([...selectedIds, ...currentIds])]);
        }
    };

    const handleBulkLike = async (shouldLike) => {
        if (selectedIds.length === 0) return;
        
        try {
            // Optimistic update
            setSongs(songs.map(s => selectedIds.includes(s.id) ? { ...s, isLiked: shouldLike } : s));

            const response = await fetch(`${API_BASE_URL}/api/library/bulk/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds, shouldLike })
            });

            if (!response.ok) {
                fetchLibrary(); // Revert via refresh
                toast.error('Failed to update favorites');
            } else {
                toast.success(`${shouldLike ? 'Liked' : 'Unliked'} ${selectedIds.length} songs`);
            }
        } catch (error) {
            fetchLibrary();
            console.error('Error in bulk like:', error);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/library/bulk/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds })
            });

            if (response.ok) {
                const results = await response.json();
                const successIds = results.success;
                setSongs(songs.filter(s => !successIds.includes(s.id)));
                setSelectedIds([]);
                setBulkDeleteModal({ show: false, count: 0 });
                toast.success(`Deleted ${successIds.length} songs`);
                
                if (results.failed.length > 0) {
                    toast.error(`Failed to delete ${results.failed.length} songs`);
                }

                // If in album view and album is now empty, go back
                if (activeAlbum) {
                    const remainingInAlbum = songs.filter(s => !successIds.includes(s.id) && s.album === activeAlbum.name);
                    if (remainingInAlbum.length === 0) {
                        handleBack();
                    }
                }
            } else {
                toast.error('Failed to delete songs');
            }
        } catch (error) {
            console.error('Error in bulk delete:', error);
            toast.error('Network error during bulk delete');
        }
    };

    const activeAlbum = useMemo(() => {
        if (!selectedAlbum) return null;
        return albums.find(a => a.name === selectedAlbum.name) || selectedAlbum;
    }, [albums, selectedAlbum]);

    useEffect(() => {
        if (selectedIds.length > 0) {
            setShowBulkBar(true);
            setIsClosing(false);
            document.body.classList.add('bulk-bar-showing');
        } else if (showBulkBar) {
            setIsClosing(true);
            document.body.classList.remove('bulk-bar-showing');
            const timer = setTimeout(() => {
                setShowBulkBar(false);
                setIsClosing(false);
            }, 300); // Snappier animation duration
            return () => clearTimeout(timer);
        }
    }, [selectedIds.length, showBulkBar]);

    const handleContainerClick = () => {
        if (openMenuId) {
            setOpenMenuId(null);
        }
    };

    return (
        <div 
            ref={containerRef}
            className={`library-container ${openMenuId ? 'has-active-menu' : ''} ${isSelectionMode ? 'selection-mode' : ''}`} 
            onClick={handleContainerClick}
        >
            {createPortal(
                <Toaster position={window.innerWidth <= 768 ? "top-center" : "bottom-center"} containerStyle={{ zIndex: 99999 }} toastOptions={{
                    style: {
                        background: 'rgba(15, 23, 42, 0.55)',
                        color: 'white',
                        backdropFilter: 'blur(var(--sd-blur-lg))',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '0.85rem',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                    },
                    success: { style: { background: 'rgba(20, 184, 166, 0.35)', border: '1px solid rgba(20, 184, 166, 0.4)' } },
                    error:   { style: { background: 'rgba(255, 49, 49, 0.35)',   border: '1px solid rgba(255, 49, 49, 0.4)' } },
                }} />,
                document.body
            )}
            
            {view === 'albums' && (
                <div className="page-header" ref={headerRef}>
                    <h2>My Library</h2>
                    <div className="page-header-controls">
                        <div className="page-search">
                            <FiSearch size={14} style={{ marginRight: '0.45rem', opacity: 0.6 }} />
                            <input
                                type="text"
                                placeholder="Search albums…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            className="page-icon-btn"
                            onClick={toggleLayout}
                            title={songLayout === 'grid' ? 'Switch to list' : 'Switch to grid'}
                        >
                            <span key={songLayout} className={layoutClicked ? 'layout-icon-anim' : ''}>
                                {songLayout === 'grid' ? <FiList size={15} /> : <FiGrid size={15} />}
                            </span>
                        </button>
                        <button
                            className={`page-icon-btn ${showFavoritesOnly ? 'active' : ''}`}
                            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                            title={showFavoritesOnly ? 'Show All' : 'Show Favorites Only'}
                        >
                            <FiHeart size={15} fill={showFavoritesOnly ? 'white' : 'none'} />
                        </button>
                        <button
                            className={`page-icon-btn sync-btn ${scanStatus}`}
                            onClick={handleScan}
                            title="Rescan Library"
                            disabled={scanStatus === 'loading'}
                        >
                            {scanStatus === 'loading' ? <FiRefreshCw className="spin" size={15} /> :
                             scanStatus === 'success' ? <FiCheck size={15} /> :
                             scanStatus === 'error' ? <FiX size={15} /> :
                             <FiRefreshCw size={15} />}
                        </button>
                    </div>
                </div>
            )}

            <div className="library-nav-chips">
                <button className="library-nav-chip" onClick={() => navigate('/albums')}>
                    <FiDisc size={15} /> Albums
                </button>
                <button className="library-nav-chip" onClick={() => navigate('/artists')}>
                    <FiUsers size={15} /> Artists
                </button>
                <button
                    className={`library-nav-chip${showFavoritesOnly ? ' active' : ''}`}
                    onClick={() => setShowFavoritesOnly(f => !f)}
                >
                    <FiHeart size={15} fill={showFavoritesOnly ? 'white' : 'none'} />
                    {showFavoritesOnly ? 'All' : 'Favorites'}
                </button>
                <button
                    className={`library-nav-chip sync-btn ${scanStatus}`}
                    onClick={handleScan}
                    disabled={scanStatus === 'loading'}
                >
                    {scanStatus === 'loading' ? <FiRefreshCw className="spin" size={15} /> :
                     scanStatus === 'success' ? <FiCheck size={15} /> :
                     scanStatus === 'error' ? <FiX size={15} /> :
                     <FiRefreshCw size={15} />}
                    {scanStatus === 'loading' ? 'Syncing…' : scanStatus === 'success' ? 'Synced' : scanStatus === 'error' ? 'Error' : 'Sync'}
                </button>
            </div>

            {loading && songs.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading library...</div>
            ) : (
                <>
                    {view === 'albums' && (
                        <div className="album-grid">
                            {filteredContent.map((album, index) => (
                                <LazyAlbumCard
                                    key={album.name}
                                    album={album}
                                    index={index}
                                    animationsDone={animationsDone}
                                    staggerDelay={speedOpt.staggerDelay}
                                    handleAlbumClick={handleAlbumClick}
                                    lastUpdate={lastUpdate}
                                />
                            ))}
                        </div>
                    )}

                    {view === 'songs' && activeAlbum && (
                        <div className="album-detail-view" key={activeAlbum.name}>
                            <button className="section-back" onClick={handleBack}>
                                <FiArrowLeft size={15} /> Albums
                            </button>
                             <div
                                className={`album-view-header ${!animationsDone ? 'fade-in' : ''}`}
                                style={{ 
                                    '--album-art-url': `url(${API_BASE_URL}/api/files/${encodeURIComponent(activeAlbum.artId)}/art?t=${lastUpdate})` 
                                }}
                             >
                                <div className="album-view-art">
                                    <img 
                                        src={`${API_BASE_URL}/api/files/${encodeURIComponent(activeAlbum.artId)}/art?t=${lastUpdate}`} 
                                        alt={activeAlbum.name}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </div>
                                <div className="album-view-details">
                                    <h1>{activeAlbum.name}</h1>
                                    <h2>{activeAlbum.artist}</h2>
                                    <div className="album-actions">
                                        <p>{activeAlbum.songs.length} songs</p>
                                        <button 
                                            className={`icon-btn favorite-btn ${activeAlbum.songs.every(s => s.isLiked) ? 'active' : ''}`} 
                                            style={{ 
                                                borderRadius: '50%'
                                            }}
                                            onClick={() => handleLikeAlbum(activeAlbum.name)}
                                            title="Like/Unlike Album"
                                        >
                                            <FiHeart 
                                                fill={activeAlbum.songs.every(s => s.isLiked) ? 'white' : 'none'} 
                                                style={{ display: 'block' }}
                                            />
                                        </button>
                                        <button 
                                            className={`icon-btn edit-mode-btn ${isSelectionMode ? 'active' : ''}`} 
                                            style={{ 
                                                borderRadius: '50%'
                                            }}
                                            onClick={() => {
                                                if (isSelectionMode) {
                                                    setIsSelectionMode(false);
                                                    setSelectedIds([]);
                                                } else {
                                                    setIsSelectionMode(true);
                                                }
                                            }}
                                            title="Toggle Selection Mode"
                                        >
                                            <FiEdit style={{ display: 'block' }} />
                                        </button>
                                    </div>
                                </div>
                             </div>

                             <div className="song-list">
                                <div className={`song-list-header ${!animationsDone ? 'fade-in' : ''}`} style={{ animationDelay: !animationsDone ? `${speedOpt.staggerDelay}s` : '0s' }}>
                                    <div>
                                        {isSelectionMode ? (
                                            <input 
                                                type="checkbox" 
                                                className="library-checkbox"
                                                checked={filteredContent.length > 0 && filteredContent.every(s => selectedIds.includes(s.id))}
                                                onChange={toggleSelectAll}
                                            />
                                        ) : '#'}
                                    </div>
                                    <div>Title</div>
                                    <div>Duration</div>
                                    <div className="hide-mobile">Size</div>
                                    <div></div>
                                </div>
                                {filteredContent.map((song, index) => (
                                    <div 
                                        key={song.id} 
                                        className={`song-row ${!animationsDone ? 'fade-in' : ''} ${openMenuId === song.id ? 'is-active-row' : ''} ${selectedIds.includes(song.id) ? 'selected' : ''}`}
                                        style={{
                                            animationDelay: !animationsDone ? `${Math.min((index + 2) * speedOpt.staggerDelay, 0.6)}s` : '0s'
                                        }}
                                        onClick={() => isSelectionMode && toggleSelect(song.id)}
                                    >
                                        <div>
                                            <span style={{ opacity: 0.5 }}>{index + 1}</span>
                                            {isSelectionMode && (
                                                <input 
                                                    type="checkbox" 
                                                    className="library-checkbox"
                                                    checked={selectedIds.includes(song.id)}
                                                    onChange={() => toggleSelect(song.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 'bold' }}>{song.title}</div>
                                        <div className="song-row-duration">{formatDuration(song.duration)}</div>
                                        <div className="song-row-size hide-mobile">{formatSize(song.size)}</div>
                                        {/* Mobile: three-dot menu */}
                                        <div className="action-container" style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                            <button
                                                className="icon-btn more-btn show-mobile"
                                                style={{ opacity: isSelectionMode ? 0 : 1, pointerEvents: isSelectionMode ? 'none' : 'auto' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setMenuOpenUpwards(window.innerHeight - rect.bottom < 200);
                                                    setOpenMenuId(openMenuId === song.id ? null : song.id);
                                                }}
                                            >
                                                <FiMoreVertical />
                                            </button>
                                            {openMenuId === song.id && (
                                                <div className={`song-menu-dropdown ${menuOpenUpwards ? 'open-upwards' : ''}`}>
                                                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(song); setOpenMenuId(null); }}>
                                                        <FiHeart fill={song.isLiked ? 'white' : 'none'} /> <span>{song.isLiked ? 'Unlike' : 'Like'}</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(song); setOpenMenuId(null); }}>
                                                        <FiEdit /> <span>Edit</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(song); setOpenMenuId(null); }} className="delete-option">
                                                        <FiTrash2 /> <span>Delete</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Desktop: slide-in pill buttons (position: absolute via CSS) */}
                                        <div className="song-row-actions hide-mobile">
                                            <button className={`row-action-btn like${song.isLiked ? ' active' : ''}`} title={song.isLiked ? 'Unlike' : 'Like'} onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}>
                                                <FiHeart size={13} fill={song.isLiked ? 'currentColor' : 'none'} />
                                                <span>{song.isLiked ? 'Unlike' : 'Like'}</span>
                                            </button>
                                            <button className="row-action-btn edit" title="Edit" onClick={(e) => { e.stopPropagation(); handleEditClick(song); }}>
                                                <FiEdit size={13} />
                                                <span>Edit</span>
                                            </button>
                                            <button className="row-action-btn delete" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(song); }}>
                                                <FiTrash2 size={13} />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}

                    {filteredContent.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', marginTop: '4rem', opacity: 0.5 }}>
                            {backendError && songs.length === 0 ? (
                                <>No items found.<div><b>Is the backend running?</b></div></>
                            ) : songs.length === 0 ? (
                                'Your library is empty. Download some songs to get started.'
                            ) : showFavoritesOnly ? (
                                'No favorites yet.'
                            ) : (
                                `No results for "${searchQuery}".`
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Edit Modal */}
            {editModal.show && createPortal(
                <div className="modal-overlay" onClick={() => setEditModal({ show: false, song: null })}>
                    <div className="modal-content edit-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title"><FiEdit size={13} /> Edit Metadata</span>
                            <button className="modal-close-btn" onClick={() => setEditModal({ show: false, song: null })}><FiX size={13} /></button>
                        </div>
                        <div className="edit-modal-body">
                        <div className="edit-modal-preview">
                            <img
                                className="edit-modal-preview-art"
                                src={editModal.song.artworkUrl || `${API_BASE_URL}/api/files/${encodeURIComponent(editModal.song.id)}/art`}
                                alt=""
                                onError={e => { e.currentTarget.style.opacity = '0'; }}
                            />
                            <div className="edit-modal-preview-info">
                                <span className="edit-modal-preview-title">{editModal.song.title || 'Unknown Title'}</span>
                                <span className="edit-modal-preview-artist">{editModal.song.artist || 'Unknown Artist'}</span>
                            </div>
                        </div>
                        <div className="edit-form">
                            <div className="edit-field span-2">
                                <label>Title</label>
                                <input
                                    type="text"
                                    value={editModal.song.title}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, title: e.target.value } })}
                                />
                            </div>
                            <div className="edit-field">
                                <label>Artist</label>
                                <input
                                    type="text"
                                    value={editModal.song.artist}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, artist: e.target.value } })}
                                />
                            </div>
                            <div className="edit-field">
                                <label>Album</label>
                                <input
                                    type="text"
                                    className={enrichedSources.album ? 'enriched-input' : ''}
                                    value={editModal.song.album}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, album: e.target.value } })}
                                />
                                {enrichedSources.album && <span className="field-source" title={`${enrichedSources.album.provider}${enrichedSources.album.context ? ` · ${enrichedSources.album.context}` : ''}`}>via {enrichedSources.album.provider}{enrichedSources.album.context ? ` · ${enrichedSources.album.context}` : ''}</span>}
                            </div>
                            <div className="edit-field">
                                <label>Year</label>
                                <input
                                    type="number"
                                    className={enrichedSources.year ? 'enriched-input' : ''}
                                    value={editModal.song.year || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, year: e.target.value } })}
                                    placeholder="e.g. 2024"
                                />
                                {enrichedSources.year && <span className="field-source" title={`${enrichedSources.year.provider}${enrichedSources.year.context ? ` · ${enrichedSources.year.context}` : ''}`}>via {enrichedSources.year.provider}{enrichedSources.year.context ? ` · ${enrichedSources.year.context}` : ''}</span>}
                            </div>
                            <div className="edit-field">
                                <label>Track Number</label>
                                <input
                                    type="text"
                                    className={enrichedSources.trackNumber ? 'enriched-input' : ''}
                                    value={editModal.song.trackNumber || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, trackNumber: e.target.value } })}
                                    placeholder="e.g. 1"
                                />
                                {enrichedSources.trackNumber && <span className="field-source" title={`${enrichedSources.trackNumber.provider}${enrichedSources.trackNumber.context ? ` · ${enrichedSources.trackNumber.context}` : ''}`}>via {enrichedSources.trackNumber.provider}{enrichedSources.trackNumber.context ? ` · ${enrichedSources.trackNumber.context}` : ''}</span>}
                            </div>
                            <div className="edit-field">
                                <label>Disc Number</label>
                                <input
                                    type="text"
                                    value={editModal.song.discNumber || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, discNumber: e.target.value } })}
                                    placeholder="e.g. 1"
                                />
                            </div>
                            <div className="edit-field">
                                <label>Genre</label>
                                <input
                                    type="text"
                                    className={enrichedSources.genre ? 'enriched-input' : ''}
                                    value={editModal.song.genre || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, genre: e.target.value } })}
                                    placeholder="e.g. Electronic"
                                />
                                {enrichedSources.genre && <span className="field-source" title={`${enrichedSources.genre.provider}${enrichedSources.genre.context ? ` · ${enrichedSources.genre.context}` : ''}`}>via {enrichedSources.genre.provider}{enrichedSources.genre.context ? ` · ${enrichedSources.genre.context}` : ''}</span>}
                            </div>
                            <div className="edit-field span-2">
                                <label>Release Date (Detailed)</label>
                                <input
                                    type="text"
                                    className={enrichedSources.releaseDate ? 'enriched-input' : ''}
                                    value={editModal.song.releaseTime || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, releaseTime: e.target.value } })}
                                    placeholder="e.g. 2024-03-12"
                                />
                                {enrichedSources.releaseDate && <span className="field-source" title={`${enrichedSources.releaseDate.provider}${enrichedSources.releaseDate.context ? ` · ${enrichedSources.releaseDate.context}` : ''}`}>via {enrichedSources.releaseDate.provider}{enrichedSources.releaseDate.context ? ` · ${enrichedSources.releaseDate.context}` : ''}</span>}
                            </div>
                            <div className="edit-field span-2">
                                <label>Comment</label>
                                <textarea
                                    value={editModal.song.comment || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, comment: e.target.value } })}
                                    placeholder="Optional notes or comment"
                                    rows={2}
                                />
                            </div>
                            <div className="edit-field span-2">
                                <label>Lyrics</label>
                                <textarea
                                    className={enrichedSources.lyrics ? 'enriched-input' : ''}
                                    value={editModal.song.lyrics || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, lyrics: e.target.value } })}
                                    placeholder="Paste lyrics here…"
                                    rows={6}
                                />
                                {enrichedSources.lyrics && <span className="field-source" title={`${enrichedSources.lyrics.provider}${enrichedSources.lyrics.context ? ` · ${enrichedSources.lyrics.context}` : ''}`}>via {enrichedSources.lyrics.provider}{enrichedSources.lyrics.context ? ` · ${enrichedSources.lyrics.context}` : ''}</span>}
                            </div>
                            <div className="edit-field span-2">
                                <label>Artwork URL</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com/image.jpg"
                                    value={editModal.song.artworkUrl || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, artworkUrl: e.target.value } })}
                                />
                            </div>
                        </div>
                        </div>{/* edit-modal-body */}
                        <div className="modal-actions">
                            <button className="modal-btn cancel" onClick={() => setEditModal({ show: false, song: null })}>Cancel</button>
                            {editModal.song && needsEnrichment(editModal.song) && (
                                <button className="modal-btn enrich" onClick={handleEnrich} disabled={isEnriching}>
                                    {isEnriching ? 'Fetching…' : 'Auto-fill'}
                                </button>
                            )}
                            <button className="modal-btn save" onClick={saveMetadata}>Save</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.show && createPortal(
                <div className="modal-overlay" onClick={() => setDeleteModal({ ...deleteModal, show: false })}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Delete Song?</h3>
                        <p>Are you sure you want to delete <b>{deleteModal.songTitle}</b>?</p>
                        <p style={{fontSize: '0.8rem', color: '#aaa', marginBottom: '2rem'}}>This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button className="modal-btn cancel" onClick={() => setDeleteModal({ ...deleteModal, show: false })}>Cancel</button>
                            <button className="modal-btn delete" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Error Modal */}
            {errorModal.show && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setErrorModal({ show: false, message: '' })}>
                            <FiX />
                        </button>
                        <h3 style={{ color: '#ff5050' }}>Error</h3>
                        <p>{errorModal.message}</p>
                    </div>
                </div>,
                document.body
            )}

            {/* Bulk Delete Modal */}
            {bulkDeleteModal.show && createPortal(
                <div className="modal-overlay" onClick={() => setBulkDeleteModal({ show: false, count: 0 })}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Delete {bulkDeleteModal.count} Songs?</h3>
                        <p>Are you sure you want to delete these songs from your library?</p>
                        <p style={{fontSize: '0.8rem', color: '#aaa', marginBottom: '2rem'}}>This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button className="modal-btn cancel" onClick={() => setBulkDeleteModal({ show: false, count: 0 })}>Cancel</button>
                            <button className="modal-btn delete" onClick={handleBulkDelete}>Delete All</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Bulk Action Bar */}
            {showBulkBar && (
                <div className="bulk-action-bar-container">
                    <div className={`bulk-action-bar ${isClosing ? 'is-closing' : ''}`}>
                        <div className="bulk-info">
                            <span className="count">
                                {selectedIds.length} <span className="show-mobile">Selected</span>
                            </span>
                        </div>
                        <div className="bulk-actions-buttons">
                            <button className="bulk-btn like" onClick={() => handleBulkLike(true)} title="Like Selected">
                                <FiHeart fill="currentColor" /> <span className="hide-mobile">Like</span>
                            </button>
                            <button className="bulk-btn unlike" onClick={() => handleBulkLike(false)} title="Unlike Selected">
                                <LuHeartOff /> <span className="hide-mobile">Unlike</span>
                            </button>
                            <button className="bulk-btn delete" onClick={() => setBulkDeleteModal({ show: true, count: selectedIds.length })} title="Delete Selected">
                                <FiTrash2 /> <span className="hide-mobile">Delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <MobileSearchBar
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search albums…"
                buttonLabel="Go"
            />
        </div>
    );
};

export default Library;