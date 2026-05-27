import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiSearch } from 'react-icons/fi';
import './css/MobileSearch.css';

const MobileSearchBar = ({ value, onChange, onSubmit, placeholder = 'Search…', buttonLabel = null }) => {
    const [pillActive, setPillActive] = useState(false);
    const blurTimer = useRef(null);

    useEffect(() => {
        document.body.classList.add('has-mobile-search');
        return () => {
            document.body.classList.remove('has-mobile-search');
            clearTimeout(blurTimer.current);
        };
    }, []);

    const handleFocus = () => {
        clearTimeout(blurTimer.current);
        if (buttonLabel) setPillActive(true);
    };

    // Delay so a tap on the pill button fires before the bar hides
    const handleBlur = () => {
        blurTimer.current = setTimeout(() => setPillActive(false), 150);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        e.currentTarget.querySelector('input')?.blur();
        onSubmit?.(e);
    };

    return createPortal(
        <form
            className={`mobile-search-wrap${pillActive ? ' pill-active' : ''}`}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSubmit={handleSubmit}
        >
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
            {buttonLabel && <button type="submit" className="mobile-search-pill">{buttonLabel}</button>}
        </form>,
        document.body
    );
};

export default MobileSearchBar;
