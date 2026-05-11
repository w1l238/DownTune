/* eslint-disable */
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiSettings, FiMusic } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './css/NavBar.css';
import { API_BASE_URL } from '../config';

const NavBar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (location.pathname === '/results' && location.state?.query) {
            setQuery(location.state.query);
        }
    }, [location]);

    const handleSearch = async () => {
        if (!query.trim()) return;

        const limit = localStorage.getItem('spotify_results_limit') || 20;

        try {
            const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (response.ok) {
                const data = await response.json();
                navigate('/results', { state: { results: data, query } });
                document.activeElement.blur();
            } else {
                console.error('Search failed');
                toast.error('Search failed. Please check server status.', { id: 'search-error' });
            }
        } catch (error) {
            console.error('Error during search:', error);
            toast.error('Network error during search. Please check server status.', { id: 'search-error' });
        }
    };
    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <nav className={`navbar ${(location.pathname === '/' || location.pathname === '/results') ? 'home-navbar' : ''}`}>
            <div className="navbar-left">
                <div className="spotify-logo">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.299c-.217.356-.677.469-1.033.252-2.863-1.748-6.466-2.144-10.709-1.177-.406.094-.813-.16-.906-.566-.094-.406.16-.813.566-.906 4.646-1.063 8.638-.61 11.83 1.34.356.216.469.677.252 1.033zm1.467-3.264c-.274.444-.853.585-1.297.311-3.275-2.013-8.267-2.597-12.138-1.422-.5.152-1.03-.131-1.182-.631-.152-.5.131-1.03.631-1.182 4.417-1.34 9.914-.687 13.676 1.627.444.275.586.853.31 1.297zm.126-3.41c-3.928-2.333-10.414-2.55-14.195-1.401-.603.183-1.24-.162-1.423-.765-.183-.603.162-1.24.765-1.423 4.342-1.319 11.503-1.065 16.035 1.623.542.321.717 1.026.396 1.568-.321.542-1.026.717-1.568.396z"/>
                    </svg>
                </div>
                <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                    <svg 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="nav-icon search-icon"
                        width="1em" 
                        height="1em"
                    >
                        <circle cx="11" cy="11" r="8" className="search-lens"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65" className="search-handle"></line>
                    </svg>
                    <span>Search</span>
                </Link>
                <Link to="/library" className={`nav-link ${location.pathname === '/library' ? 'active' : ''}`}>
                    <FiMusic className="nav-icon music-icon" />
                    <span>Library</span>
                </Link>
            </div>
            
            <div className="navbar-search">
                {location.pathname !== '/' && location.pathname !== '/settings' && location.pathname !== '/library' && (
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyPress={handleKeyPress}
                        />
                        <button onClick={handleSearch} className="search-icon-btn">
                            <svg 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                className="navbar-search-btn-icon"
                                width="1em" 
                                height="1em"
                            >
                                <circle cx="11" cy="11" r="8" className="search-lens"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65" className="search-handle"></line>
                            </svg>
                        </button>
                    </div>
                )}
            </div>
            <div className="navbar-links">
                <Link to="/settings" className={`settings-icon ${location.pathname === '/settings' ? 'active' : ''}`}>
                    <FiSettings />
                </Link>
            </div>
        </nav>
    );
};

export default NavBar;
