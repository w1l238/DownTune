import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiDownload, FiRefreshCw, FiSearch, FiCheck } from 'react-icons/fi';
import Popup from '../components/Popup';
import { API_BASE_URL } from '../config';
import './css/Results.css';

const Results = () => {
    useEffect(() => {
        document.title = 'Results - Spotify Downloader';
        return () => {
            document.body.classList.remove('search-focused');
        };
    }, []);

    const location = useLocation();
    const navigate = useNavigate();
    const initialResults = location.state?.results || { items: [], next: null, previous: null };
    const [results, setResults] = useState(initialResults);
    const [downloading, setDownloading] = useState({});
    const [popup, setPopup] = useState({ visible: false, message: '', type: '' });
    const [query, setQuery] = useState(location.state?.query || '');
    const [library, setLibrary] = useState([]);

    useEffect(() => {
        setResults(location.state?.results || { items: [], next: null, previous: null });
        if (location.state?.query) setQuery(location.state.query);
    }, [location.state]);

    useEffect(() => {
        fetchLibrary();
    }, []);

    const fetchLibrary = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/library`);
            if (response.ok) {
                const data = await response.json();
                setLibrary(data);
            }
        } catch (error) {
            console.error('Error fetching library:', error);
        }
    };

    const isTrackDownloaded = (track) => {
        return library.some(song => 
            song.title.toLowerCase() === track.name.toLowerCase() &&
            track.artists.some(artist => song.artist.toLowerCase().includes(artist.name.toLowerCase()))
        );
    };

    const handleSearch = async () => {
        if (!query.trim()) return;

        const limit = localStorage.getItem('spotify_results_limit') || 20;

        try {
            const response = await fetch(`${API_BASE_URL}/search-spotify?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (response.ok) {
                const data = await response.json();
                setResults(data.tracks); // Update results directly since we are on the page
                // Optionally update URL/history if we want back button to work for searches?
                // navigate('/results', { state: { results: data.tracks } }); // This pushes new entry
                window.history.pushState({ results: data.tracks, query }, ''); // Or just set state
                document.activeElement.blur(); // Dismiss keyboard
            } else {
                setPopup({ visible: true, message: 'Search failed. Check server status.', type: 'error' });
            }
        } catch (error) {
            console.error('Error during search:', error);
            setPopup({ visible: true, message: 'Network error during search.', type: 'error' });
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    const handleDownload = async (track) => {
        setDownloading(prev => ({ ...prev, [track.id]: true }));

        const trackDetails = {
            trackName: track.name,
            artistName: track.artists.map(artist => artist.name).join(', '),
            albumName: track.album.name,
            albumArtUrl: track.album.images[0]?.url,
            year: track.album.release_date ? track.album.release_date.substring(0, 4) : undefined
        };

        try {
            const response = await fetch(`${API_BASE_URL}/download-song`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(trackDetails),
            });

            const data = await response.json();
            if (response.ok) {
                if (data.status === 'exists') {
                    setPopup({ visible: true, message: 'Song already downloaded', type: 'info' });
                    fetchLibrary(); // Refresh library status
                } else {
                    setPopup({ visible: true, message: 'Download successful!', type: 'success' });
                    fetchLibrary(); // Refresh library status
                }
            } else {
                setPopup({ visible: true, message: data.error || 'Download failed.', type: 'error' });
            }
        } catch (error) {
            console.error('Error downloading song:', error);
            setPopup({ visible: true, message: 'Download failed.', type: 'error' });
        } finally {
            setDownloading(prev => ({ ...prev, [track.id]: false }));
        }
    };

    const fetchPage = async (url) => {
        if (!url) return;

        try {
            const response = await fetch(`${API_BASE_URL}/spotify-proxy?url=${encodeURIComponent(url)}`);
            if (response.ok) {
                const data = await response.json();
                setResults(data.tracks);
            } else {
                console.error('Failed to fetch page');
            }
        } catch (error) {
            console.error('Error fetching page:', error);
        }
    };

    const closePopup = () => {
        setPopup({ visible: false, message: '', type: '' });
    };

    return (
        <div className="results-container">
            {popup.visible && <Popup message={popup.message} type={popup.type} onClose={closePopup} />}
            
            <div className="search-container mobile-only-search">
                <input
                    type="text"
                    placeholder="Search for a song..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    onFocus={() => document.body.classList.add('search-focused')}
                    onBlur={() => document.body.classList.remove('search-focused')}
                />
                <button onClick={handleSearch} className="search-icon-btn">
                    <FiSearch />
                </button>
            </div>

            <h1>Results</h1>
            <div className="results-list">
                {results.items.length > 0 ? (
                    results.items.map((track) => (
                        <div key={track.id} className="track-item">
                            <img src={track.album.images[1]?.url || track.album.images[0]?.url || ''} alt={track.album.name} className="result-album-art" />
                            <div className="track-info">
                                <span className="track-name">{track.name}</span>
                                <span className="artist-name">{track.artists.map(artist => artist.name).join(', ')}</span>
                                <span className="album-name">{track.album.name}</span>
                            </div>
                            <button
                                className={`download-button ${downloading[track.id] ? 'loading' : ''} ${isTrackDownloaded(track) ? 'downloaded' : ''}`}
                                onClick={() => !isTrackDownloaded(track) && handleDownload(track)}
                                disabled={downloading[track.id] || isTrackDownloaded(track)}
                            >
                                <span className="btn-text">
                                    {downloading[track.id] ? 'Downloading...' : (isTrackDownloaded(track) ? 'Downloaded' : 'Download')}
                                </span>
                                <span className="btn-icon">
                                    {downloading[track.id] ? <FiRefreshCw className="spin" /> : (isTrackDownloaded(track) ? <FiCheck /> : <FiDownload />)}
                                </span>
                            </button>
                        </div>
                    ))
                ) : (
                    <p>No results found.</p>
                )}
            </div>
            <div className="pagination-controls">
                <button onClick={() => fetchPage(results.previous)} disabled={!results.previous}>
                    Previous
                </button>
                <button onClick={() => fetchPage(results.next)} disabled={!results.next}>
                    Next
                </button>
            </div>
        </div>
    );
};

export default Results;
