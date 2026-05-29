import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiMusic, FiRefreshCw, FiCheck, FiDisc } from 'react-icons/fi';
import { useDownloadTrack } from '../hooks/useDownloadTrack';
import { API_BASE_URL } from '../config';
import './css/Results.css';
import './css/Library.css';
import './css/SearchArtist.css';

const SearchArtist = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const albumArtStyle = localStorage.getItem('album_art_style') || 'background';

    const [artist, setArtist] = useState(null);
    const [topTracks, setTopTracks] = useState([]);
    const [albums, setAlbums] = useState([]);
    const [library, setLibrary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLibrary = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library`);
            if (res.ok) setLibrary(await res.json());
        } catch { /* silently fail */ }
    };

    const { downloading, handleDownload } = useDownloadTrack(fetchLibrary);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [artistRes, libRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/artist/${id}`),
                fetch(`${API_BASE_URL}/api/library`),
            ]);
            if (!artistRes.ok) {
                const err = await artistRes.json();
                throw new Error(err.error || 'Failed to load artist');
            }
            const data = await artistRes.json();
            setArtist(data.artist);
            setTopTracks(data.topTracks || []);
            setAlbums(data.albums || []);
            document.title = `${data.artist.name} — DownTune`;
            if (libRes.ok) setLibrary(await libRes.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const isTrackDownloaded = (track) =>
        library.some(song =>
            song.title.toLowerCase() === track.name.toLowerCase() &&
            track.artists.some(a => song.artist.toLowerCase().includes(a.name.toLowerCase()))
        );

    if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading…</div>;
    if (error) return (
        <div style={{ textAlign: 'center', marginTop: '4rem', opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <p style={{ opacity: 0.6 }}>{error}</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="section-back" onClick={() => navigate(-1)}>
                    <FiChevronLeft size={15} /> Back
                </button>
                <button className="section-back" onClick={load}>
                    <FiRefreshCw size={15} /> Retry
                </button>
            </div>
        </div>
    );
    if (!artist) return null;

    return (
        <div className="library-container sa-page">

            {/* Desktop back button */}
            <button className="section-back" onClick={() => navigate(-1)}>
                <FiChevronLeft size={15} /> Back
            </button>

            {/* Hero */}
            <div className={`album-view-header art-${albumArtStyle}`}>
                <button className="section-back album-back" onClick={() => navigate(-1)}>
                    <FiChevronLeft size={20} />
                </button>
                <div className="album-view-art sa-artist-art">
                    {artist.picture
                        ? <img src={artist.picture} alt={artist.name} onError={e => { e.target.style.display = 'none'; }} />
                        : null}
                </div>
                <div className="album-view-details">
                    <h1>{artist.name}</h1>
                    <h2>
                        {[
                            artist.nbFan  != null ? `${artist.nbFan.toLocaleString()} fans` : null,
                            artist.nbAlbum != null ? `${artist.nbAlbum} albums`             : null,
                        ].filter(Boolean).join(' · ')}
                    </h2>
                </div>
            </div>

            {/* Top Tracks */}
            {topTracks.length > 0 && (
                <div className="sa-section">
                    <p className="sa-section-label">Top Tracks</p>
                    <div className="results-grid">
                        {topTracks.map(track => {
                            const downloaded = isTrackDownloaded(track);
                            const isDownloading = downloading[track.id];
                            return (
                                <div key={track.id} className="track-row">
                                    <div className="track-art">
                                        {track.album.images[0]?.url
                                            ? <img src={track.album.images[0].url} alt={track.album.name} />
                                            : <FiMusic size={22} />}
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
                        })}
                    </div>
                </div>
            )}

            {/* Albums */}
            {albums.length > 0 && (
                <div className="sa-section">
                    <p className="sa-section-label">Albums</p>
                    <div className="sa-albums-shelf-outer">
                    <div className="sa-albums-shelf">
                        {albums.map(album => (
                            <div
                                key={album.id}
                                className="result-album-card"
                                onClick={() => navigate(`/search/album/${album.id}`)}
                            >
                                <div className="result-card-art">
                                    {album.coverUrl
                                        ? <img src={album.coverUrl} alt={album.title} onError={e => { e.target.style.display = 'none'; }} />
                                        : <FiDisc size={32} />}
                                </div>
                                <div className="result-card-info">
                                    <span className="result-card-name">{album.title}</span>
                                    {album.releaseDate && (
                                        <span className="result-card-meta">{album.releaseDate.substring(0, 4)}</span>
                                    )}
                                    {album.nbTracks != null && (
                                        <span className="result-card-sub">{album.nbTracks} tracks</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchArtist;
