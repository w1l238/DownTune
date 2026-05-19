import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiSearch } from 'react-icons/fi';
import './css/MobileSearch.css';

const MobileSearchBar = ({ value, onChange, onSubmit, placeholder = 'Search…', buttonLabel = 'Go' }) => {
    useEffect(() => {
        document.body.classList.add('has-mobile-search');
        return () => document.body.classList.remove('has-mobile-search');
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        e.currentTarget.querySelector('input')?.blur();
        onSubmit?.(e);
    };

    return createPortal(
        <form className="mobile-search-wrap" onSubmit={handleSubmit}>
            <div className="mobile-search-bar">
                <FiSearch size={17} className="mobile-search-icon" />
                <input
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    autoComplete="off"
                    enterKeyHint={buttonLabel === 'Search' ? 'search' : 'go'}
                />
            </div>
            <button type="submit" className="mobile-search-pill">{buttonLabel}</button>
        </form>,
        document.body
    );
};

export default MobileSearchBar;
