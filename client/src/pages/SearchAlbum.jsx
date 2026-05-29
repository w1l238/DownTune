import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiRefreshCw, FiCheck, FiDownload } from 'react-icons/fi';
import { useDownloadTrack } from '../hooks/useDownloadTrack';
import { API_BASE_URL } from '../config';
import './css/Results.css';
import './css/Library.css';
import './css/SearchAlbum.css';

const SearchAlbum = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const albumArtStyle = localStorage.getItem('album_art_style') || 'background';

    const [albumData, setAlbumData] = useState(null); // { album, tracks }
    const [library, setLibrary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);

    const fetchLibrary = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/library`);
            if (res.ok) setLibrary(await res.json());
        } catch { /* silently fail */ }
    };

    const { downloading, handleDownload } = useDownloadTrack(fetchLibrary);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [albumRes, libRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/album/${id}`),
                    fetch(`${API_BASE_URL}/api/library`),
                ]);
                if (!albumRes.ok) {
                    const err = await albumRes.json();
                    throw new Error(err.error || 'Failed to load album');
                }
                const data = await albumRes.json();
                setAlbumData(data);
                document.title = `${data.album.title} — DownTune`;
                if (libRes.ok) setLibrary(await libRes.json());
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const isTrackDownloaded = (track) =>
        library.some(song =>
            song.title.toLowerCase() === track.name.toLowerCase() &&
            track.artists.some(a => song.artist.toLowerCase().includes(a.name.toLowerCase()))
        );

    const handleDownloadAlbum = async () => {
        if (!albumData || isDownloadingAll) return;
        const mode = localStorage.getItem('download_album_mode') || 'sequential';
        const pending = albumData.tracks.filter(t => !isTrackDownloaded(t));
        if (pending.length === 0) return;

        setIsDownloadingAll(true);
        try {
            if (mode === 'parallel') {
                await Promise.all(pending.map(t => handleDownload(t)));
            } else {
                for (const track of pending) {
                    await handleDownload(track);
                }
            }
        } finally {
            setIsDownloadingAll(false);
            fetchLibrary();
        }
    };

    if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading…</div>;
    if (error)   return <div style={{ textAlign: 'center', marginTop: '4rem', opacity: 0.6 }}><p>{error}</p><button className="section-back" onClick={() => navigate(-1)}><FiChevronLeft size={15} /> Back</button></div>;
    if (!albumData) return null;

    const { album, tracks } = albumData;
    const allDownloaded = tracks.length > 0 && tracks.every(t => isTrackDownloaded(t));

    return (
        <div className="library-container sab-page">

            {/* Desktop back button */}
            <button className="section-back" onClick={() => navigate(-1)}>
                <FiChevronLeft size={15} /> Back
            </button>

            {/* Hero */}
            <div className={`album-view-header art-${albumArtStyle}`}>
                <button className="section-back album-back" onClick={() => navigate(-1)}>
                    <FiChevronLeft size={20} />
                </button>
                <div className="album-view-art">
                    {album.coverUrl && (
                        <img src={album.coverUrl} alt={album.title} onError={e => { e.target.style.display = 'none'; }} />
                    )}
                </div>
                <div className="album-view-details">
                    <h1>{album.title}</h1>
                    <h2>{album.artist}</h2>
                    <div className="album-actions">
                        <p>
                            {[
                                album.releaseDate?.substring(0, 4),
                                album.nbTracks ? `${album.nbTracks} ${album.nbTracks === 1 ? 'song' : 'songs'}` : null,
                            ].filter(Boolean).join(' · ')}
                        </p>
                        <button
                            className={`hero-action-btn download-album-btn ${allDownloaded ? 'all-downloaded' : ''}`}
                            onClick={handleDownloadAlbum}
                            disabled={isDownloadingAll || allDownloaded}
                            title={allDownloaded ? 'All tracks downloaded' : 'Download all tracks'}
                        >
                            {isDownloadingAll
                                ? <><FiRefreshCw className="spin" size={14} /><span>Downloading…</span></>
                                : allDownloaded
                                    ? <><FiCheck size={14} /><span>Downloaded</span></>
                                    : <><FiDownload size={14} /><span>Download Album</span></>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Track list */}
            <div className="results-grid">
                {tracks.map(track => {
                    const downloaded = isTrackDownloaded(track);
                    const isDownloading = downloading[track.id];
                    return (
                        <div key={track.id} className="track-row">
                            <div className="track-info">
                                <span className="track-name">{track.name}</span>
                                <span className="track-meta">{track.artists.map(a => a.name).join(', ')}</span>
                                {track.trackNumber && (
                                    <span className="track-album">Track {track.trackNumber}</span>
                                )}
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
                })}
            </div>
        </div>
    );
};

export default SearchAlbum;
