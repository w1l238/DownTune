import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiCheck } from 'react-icons/fi';
import './css/CustomDropdown.css';

const CustomDropdown = ({ options, value, onChange, placeholder = "Select an option", onToggle }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const isInitialMount = useRef(true);

    // Notify parent of toggle state only when isOpen changes
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (onToggle) {
            onToggle(isOpen);
        }
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (optionValue) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className={`custom-dropdown-container ${isOpen ? 'is-open' : ''}`} ref={dropdownRef}>
            <div 
                className={`dropdown-header ${isOpen ? 'is-open' : ''}`} 
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{selectedOption ? selectedOption.name : placeholder}</span>
                <FiChevronDown className="dropdown-arrow" />
            </div>
            
            {isOpen && (
                <div className="dropdown-list">
                    {options.map((option) => (
                        <div 
                            key={option.value} 
                            className={`dropdown-item ${value === option.value ? 'selected' : ''}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            {value === option.value && <FiCheck style={{ fontSize: '0.9rem' }} />}
                            <span style={{ marginLeft: value === option.value ? '0' : '1.4rem' }}>
                                {option.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomDropdown;
