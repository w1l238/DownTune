import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiChevronLeft, FiHeart, FiTrash2, FiMoreVertical, FiEdit, FiX } from 'react-icons/fi';
import { LuHeartOff } from 'react-icons/lu';
import toast, { Toaster } from 'react-hot-toast';
import { API_BASE_URL } from '../config';
import './css/Library.css';

const AlbumDetail = () => {
    const { albumName: encodedName } = useParams();
    const albumName = decodeURIComponent(encodedName);
    const navigate = useNavigate();

    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const albumArtStyle = localStorage.getItem('album_art_style') || 'background';
    const [deleteModal, setDeleteModal] = useState({ show: false, songId: null, songTitle: '' });
    const [editModal, setEditModal] = useState({ show: false, song: null });
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [menuPos, setMenuPos] = useState(null); // { top|bottom, right } in viewport coords
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichedSources, setEnrichedSources] = useState({});
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkDeleteModal, setBulkDeleteModal] = useState({ show: false, count: 0 });
    const [showBulkBar, setShowBulkBar] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        document.title = `${albumName} — DownTune`;
        fetch(`${API_BASE_URL}/api/library`)
            .then(r => r.json())
            .then(data => {
                setSongs(data.filter(s => (s.album || 'Unknown Album') === albumName));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [albumName]);

    const album = useMemo(() => {
        if (songs.length === 0) return null;
        return { name: albumName, artist: songs[0].artist || 'Unknown Artist', artId: songs[0].id, songs };
    }, [songs, albumName]);

    const formatDuration = (s) => {
        if (!s) return '--:--';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const toggleFavorite = async (song) => {
        setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isLiked: !s.isLiked } : s));
        try {
            const res = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(song.id)}/toggle-favorite`, { method: 'POST' });
            if (!res.ok) setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isLiked: song.isLiked } : s));
        } catch {
            setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isLiked: song.isLiked } : s));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        const allSelected = songs.every(s => selectedIds.includes(s.id));
        setSelectedIds(allSelected ? [] : songs.map(s => s.id));
    };

    const handleBulkLike = async (shouldLike) => {
        if (selectedIds.length === 0) return;
        const prev = songs.map(s => ({ ...s }));
        setSongs(songs.map(s => selectedIds.includes(s.id) ? { ...s, isLiked: shouldLike } : s));
        try {
            const res = await fetch(`${API_BASE_URL}/api/library/bulk/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds, shouldLike }),
            });
            if (!res.ok) {
                setSongs(prev);
                toast.error('Failed to update favorites');
            } else {
                toast.success(`${shouldLike ? 'Liked' : 'Unliked'} ${selectedIds.length} songs`);
            }
        } catch {
            setSongs(prev);
            toast.error('Network error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/library/bulk/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds }),
            });
            if (res.ok) {
                const results = await res.json();
                const successIds = results.success;
                const remaining = songs.filter(s => !successIds.includes(s.id));
                setSongs(remaining);
                setSelectedIds([]);
                setBulkDeleteModal({ show: false, count: 0 });
                toast.success(`Deleted ${successIds.length} songs`);
                if (results.failed?.length > 0) toast.error(`Failed to delete ${results.failed.length} songs`);
                if (remaining.length === 0) navigate(-1);
            } else {
                toast.error('Failed to delete songs');
            }
        } catch {
            toast.error('Network error during bulk delete');
        }
    };

    useEffect(() => {
        if (selectedIds.length > 0) {
            setShowBulkBar(true);
            setIsClosing(false);
            document.body.classList.add('bulk-bar-showing');
        } else if (showBulkBar) {
            setIsClosing(true);
            document.body.classList.remove('bulk-bar-showing');
            const timer = setTimeout(() => { setShowBulkBar(false); setIsClosing(false); }, 300);
            return () => clearTimeout(timer);
        }
    }, [selectedIds.length, showBulkBar]);

    const likeAlbum = async () => {
        const allLiked = songs.every(s => s.isLiked);
        const shouldLike = !allLiked;
        const ids = songs.map(s => s.id);
        setSongs(prev => prev.map(s => ({ ...s, isLiked: shouldLike })));
        try {
            const res = await fetch(`${API_BASE_URL}/api/library/bulk/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, shouldLike }),
            });
            if (!res.ok) setSongs(prev => prev.map(s => ({ ...s, isLiked: !shouldLike })));
            else toast.success(shouldLike ? `Liked all songs in "${albumName}"` : `Unliked all songs in "${albumName}"`);
        } catch {
            setSongs(prev => prev.map(s => ({ ...s, isLiked: !shouldLike })));
        }
    };

    const needsEnrichment = (song) =>
        !song.lyrics || !song.genre || !song.year || !song.trackNumber ||
        !song.album || song.album === 'Unknown Album' || song.album === 'YouTube Music';

    const handleEnrich = async () => {
        if (!editModal.song) return;
        setIsEnriching(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(editModal.song.id)}/enrich`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed to fetch metadata'); return; }
            if (data.found.length === 0) {
                toast('Nothing new found', { icon: 'ℹ️' });
            } else {
                setEditModal(prev => ({ ...prev, song: { ...prev.song, ...data.enriched } }));
                setEnrichedSources(data.sources || {});
                toast.success(`Found: ${data.found.join(', ')}`);
            }
        } catch {
            toast.error('Network error fetching metadata');
        } finally {
            setIsEnriching(false);
        }
    };

    // Clear enrichment highlights when modal is closed
    useEffect(() => {
        if (!editModal.show) setEnrichedSources({});
    }, [editModal.show]);

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
            const res = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(song.id)}/metadata`, {
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
                }),
            });
            if (res.ok) {
                toast.success('Metadata updated');
                setEditModal({ show: false, song: null });
                // Re-fetch to reflect any changes (e.g. title, artist)
                const libRes = await fetch(`${API_BASE_URL}/api/library`);
                if (libRes.ok) {
                    const data = await libRes.json();
                    setSongs(data.filter(s => (s.album || 'Unknown Album') === albumName));
                }
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to update metadata');
            }
        } catch {
            toast.error('Network error saving metadata');
        }
    };

    const confirmDelete = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(deleteModal.songId)}`, { method: 'DELETE' });
            if (res.ok) {
                const remaining = songs.filter(s => s.id !== deleteModal.songId);
                setSongs(remaining);
                toast.success(`Deleted "${deleteModal.songTitle}"`);
                if (remaining.length === 0) navigate(-1);
            } else {
                toast.error('Failed to delete song');
            }
        } catch {
            toast.error('Network error deleting song');
        } finally {
            setDeleteModal({ show: false, songId: null, songTitle: '' });
        }
    };

    if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading…</div>;

    if (!album) return (
        <div style={{ textAlign: 'center', marginTop: '4rem', opacity: 0.6 }}>
            <p>Album not found.</p>
            <button className="section-back" onClick={() => navigate(-1)}>
                <FiArrowLeft size={15} /> Back
            </button>
        </div>
    );

    return (
        <div className="library-container">
            {createPortal(
                <Toaster position="top-center" containerStyle={{ zIndex: 99999 }} toastOptions={{
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

            <button className="section-back" onClick={() => navigate(-1)}>
                <FiArrowLeft size={15} /> Back
            </button>

            <div className={`album-view-header art-${albumArtStyle}`}>
                <button className="section-back album-back" onClick={() => navigate(-1)}>
                    <FiChevronLeft size={20} />
                </button>
                <div className="album-view-art">
                    <img
                        src={`${API_BASE_URL}/api/files/${encodeURIComponent(album.artId)}/art`}
                        alt={album.name}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>
                <div className="album-view-details">
                    <h1>{album.name}</h1>
                    <h2>{album.artist}</h2>
                    <div className="album-actions">
                        <p>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</p>
                        <button
                            className={`hero-action-btn like-btn ${songs.every(s => s.isLiked) ? 'active' : ''}`}
                            onClick={likeAlbum}
                            title="Like / Unlike Album"
                        >
                            <FiHeart size={14} fill={songs.every(s => s.isLiked) ? 'currentColor' : 'none'} />
                            <span className="hide-mobile">{songs.every(s => s.isLiked) ? 'Unlike' : 'Like'}</span>
                        </button>
                        <button
                            className={`icon-btn edit-mode-btn ${isSelectionMode ? 'active' : ''}`}
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
                            <span className="hide-mobile">{isSelectionMode ? 'Done' : 'Select'}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className={`song-list ${isSelectionMode ? 'selection-mode' : ''}`}>
                <div className="song-list-header">
                    <div>
                        {isSelectionMode ? (
                            <input
                                type="checkbox"
                                className="library-checkbox"
                                checked={songs.length > 0 && songs.every(s => selectedIds.includes(s.id))}
                                onChange={toggleSelectAll}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : '#'}
                    </div>
                    <div>Title</div>
                    <div>Duration</div>
                    <div className="hide-mobile">Size</div>
                    <div />
                </div>
                {songs.map((song, index) => (
                    <div
                        key={song.id}
                        className={`song-row ${menuOpenId === song.id ? 'is-active-row' : ''} ${selectedIds.includes(song.id) ? 'selected' : ''}`}
                        onClick={() => isSelectionMode && toggleSelect(song.id)}
                    >
                        <div className="song-row-num">
                            {isSelectionMode
                                ? <input type="checkbox" className="library-checkbox" checked={selectedIds.includes(song.id)} onChange={() => toggleSelect(song.id)} onClick={e => e.stopPropagation()} />
                                : index + 1}
                        </div>
                        <div className="song-row-title">{song.title}</div>
                        <div className="song-row-duration">{formatDuration(song.duration)}</div>
                        <div className="song-row-size hide-mobile">{formatSize(song.size)}</div>
                        {/* Mobile: three-dot menu */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', opacity: isSelectionMode ? 0 : 1, pointerEvents: isSelectionMode ? 'none' : 'auto' }}>
                            <button
                                className="icon-btn more-btn show-mobile"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (menuOpenId === song.id) {
                                        setMenuOpenId(null);
                                        setMenuPos(null);
                                    } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        // On mobile reserve space for the fixed bottom nav bar
                                        const navReserve = window.innerWidth <= 768 ? 80 : 0;
                                        const dropdownH = 165;
                                        const openUpwards = (window.innerHeight - rect.bottom - navReserve) < dropdownH;
                                        setMenuPos({
                                            ...(openUpwards
                                                ? { bottom: window.innerHeight - rect.top + 4, top: 'auto' }
                                                : { top: rect.bottom + 4 }),
                                            right: window.innerWidth - rect.right,
                                        });
                                        setMenuOpenId(song.id);
                                    }
                                }}
                            >
                                <FiMoreVertical />
                            </button>
                        </div>
                        {/* Desktop: slide-in pill buttons (position: absolute via CSS) */}
                        <div className="song-row-actions hide-mobile" style={{ opacity: isSelectionMode ? 0 : undefined, pointerEvents: isSelectionMode ? 'none' : undefined }}>
                            <button className={`row-action-btn like${song.isLiked ? ' active' : ''}`} title={song.isLiked ? 'Unlike' : 'Like'} onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}>
                                <FiHeart size={13} fill={song.isLiked ? 'currentColor' : 'none'} />
                                <span>{song.isLiked ? 'Unlike' : 'Like'}</span>
                            </button>
                            <button className="row-action-btn edit" title="Edit" onClick={(e) => { e.stopPropagation(); handleEditClick(song); }}>
                                <FiEdit size={13} />
                                <span>Edit</span>
                            </button>
                            <button className="row-action-btn delete" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteModal({ show: true, songId: song.id, songTitle: song.title }); }}>
                                <FiTrash2 size={13} />
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Portal overlay + dropdown — both on document.body to escape backdrop-filter containment */}
            {menuOpenId && menuPos && createPortal(
                <>
                    <div className="portal-overlay" onClick={() => { setMenuOpenId(null); setMenuPos(null); }} />
                    {(() => {
                        const activeSong = songs.find(s => s.id === menuOpenId);
                        if (!activeSong) return null;
                        return (
                            <div
                                className={`song-menu-dropdown${menuPos?.top === 'auto' ? ' open-upwards' : ''}`}
                                style={{ position: 'fixed', zIndex: 2001, ...menuPos }}
                            >
                                <button className={activeSong.isLiked ? 'liked' : ''} onClick={() => { toggleFavorite(activeSong); setMenuOpenId(null); setMenuPos(null); }}>
                                    <FiHeart fill={activeSong.isLiked ? 'currentColor' : 'none'} />
                                    <span>{activeSong.isLiked ? 'Unlike' : 'Like'}</span>
                                </button>
                                <button onClick={() => { handleEditClick(activeSong); setMenuOpenId(null); setMenuPos(null); }}>
                                    <FiEdit /> <span>Edit</span>
                                </button>
                                <button
                                    className="delete-option"
                                    onClick={() => { setDeleteModal({ show: true, songId: activeSong.id, songTitle: activeSong.title }); setMenuOpenId(null); setMenuPos(null); }}
                                >
                                    <FiTrash2 /> <span>Delete</span>
                                </button>
                            </div>
                        );
                    })()}
                </>,
                document.body
            )}

            {editModal.show && editModal.song && createPortal(
                <>
                    <div className="portal-overlay" onClick={() => setEditModal({ show: false, song: null })} />
                    <div className="modal-backdrop" style={{ zIndex: 2001 }} onClick={() => setEditModal({ show: false, song: null })}>
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
                                    value={editModal.song.title || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, title: e.target.value } })}
                                />
                            </div>
                            <div className="edit-field">
                                <label>Artist</label>
                                <input
                                    type="text"
                                    value={editModal.song.artist || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, artist: e.target.value } })}
                                />
                            </div>
                            <div className="edit-field">
                                <label>Album</label>
                                <input
                                    type="text"
                                    className={enrichedSources.album ? 'enriched-input' : ''}
                                    value={editModal.song.album || ''}
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
                                    className={enrichedSources.releaseTime ? 'enriched-input' : ''}
                                    value={editModal.song.releaseTime || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, releaseTime: e.target.value } })}
                                    placeholder="e.g. 2024-03-12"
                                />
                                {enrichedSources.releaseTime && <span className="field-source" title={`${enrichedSources.releaseTime.provider}${enrichedSources.releaseTime.context ? ` · ${enrichedSources.releaseTime.context}` : ''}`}>via {enrichedSources.releaseTime.provider}{enrichedSources.releaseTime.context ? ` · ${enrichedSources.releaseTime.context}` : ''}</span>}
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
                                {enrichedSources.lyrics && <span className="field-source">via {enrichedSources.lyrics.provider}</span>}
                            </div>
                            <div className="edit-field span-2">
                                <label>Artwork URL</label>
                                <input
                                    type="text"
                                    value={editModal.song.artworkUrl || ''}
                                    onChange={e => setEditModal({ ...editModal, song: { ...editModal.song, artworkUrl: e.target.value } })}
                                    placeholder="https://example.com/image.jpg"
                                />
                            </div>
                        </div>
                        </div>{/* edit-modal-body */}
                        <div className="modal-actions">
                            <button className="modal-btn cancel" onClick={() => setEditModal({ show: false, song: null })}>Cancel</button>
                            {needsEnrichment(editModal.song) && (
                                <button className="modal-btn enrich" onClick={handleEnrich} disabled={isEnriching}>
                                    {isEnriching ? 'Fetching…' : 'Auto-fill'}
                                </button>
                            )}
                            <button className="modal-btn save" onClick={saveMetadata}>Save</button>
                        </div>
                    </div>
                </div>
                </>,
                document.body
            )}

            {deleteModal.show && createPortal(
                <>
                    <div className="portal-overlay" onClick={() => setDeleteModal({ ...deleteModal, show: false })} />
                    <div className="modal-backdrop" onClick={() => setDeleteModal({ ...deleteModal, show: false })}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>Delete Song?</h3>
                            <p>Are you sure you want to delete <b>{deleteModal.songTitle}</b>?</p>
                            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '2rem' }}>This action cannot be undone.</p>
                            <div className="modal-actions">
                                <button className="modal-btn cancel" onClick={() => setDeleteModal({ ...deleteModal, show: false })}>Cancel</button>
                                <button className="modal-btn delete" onClick={confirmDelete}>Delete</button>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}

            {bulkDeleteModal.show && createPortal(
                <>
                    <div className="portal-overlay" onClick={() => setBulkDeleteModal({ show: false, count: 0 })} />
                    <div className="modal-backdrop" onClick={() => setBulkDeleteModal({ show: false, count: 0 })}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>Delete {bulkDeleteModal.count} Songs?</h3>
                            <p>Are you sure you want to delete these songs from your library?</p>
                            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '2rem' }}>This action cannot be undone.</p>
                            <div className="modal-actions">
                                <button className="modal-btn cancel" onClick={() => setBulkDeleteModal({ show: false, count: 0 })}>Cancel</button>
                                <button className="modal-btn delete" onClick={handleBulkDelete}>Delete All</button>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}

            {showBulkBar && createPortal(
                <div className="bulk-action-bar-container">
                    <div className={`bulk-action-bar ${isClosing ? 'is-closing' : ''}`}>
                        <div className="bulk-bar-inner">
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
                            </div>
                        </div>
                        <button className="bulk-btn delete" onClick={() => setBulkDeleteModal({ show: true, count: selectedIds.length })} title="Delete Selected">
                            <FiTrash2 /> <span className="hide-mobile">Delete</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AlbumDetail;
