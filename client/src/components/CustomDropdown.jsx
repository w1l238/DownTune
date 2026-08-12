import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiCheck } from 'react-icons/fi';
import './css/CustomDropdown.css';

const CustomDropdown = ({ options, value, onChange, placeholder = 'Select an option', disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [listPos, setListPos] = useState(null);
    const triggerRef = useRef(null);

    const open = () => {
        if (disabled) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setListPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        setIsOpen(true);
    };

    const close = () => {
        setIsOpen(false);
        setListPos(null);
    };

    const handleSelect = (optionValue) => {
        onChange(optionValue);
        close();
    };

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="custom-dropdown-container">
            <div
                ref={triggerRef}
                className={`dropdown-header ${isOpen ? 'is-open' : ''}${disabled ? ' disabled' : ''}`}
                onClick={isOpen ? close : open}
                aria-disabled={disabled}
            >
                <span>{selectedOption ? selectedOption.name : placeholder}</span>
                <FiChevronDown className="dropdown-arrow" />
            </div>

            {!disabled && isOpen && listPos && createPortal(
                <>
                    <div className="portal-overlay" onClick={close} />
                    <div
                        className="dropdown-list"
                        style={{
                            position: 'fixed',
                            top: listPos.top,
                            left: listPos.left,
                            width: listPos.width,
                            zIndex: 2001,
                        }}
                    >
                        {options.map((option) => (
                            <div
                                key={option.value}
                                className={`dropdown-item ${value === option.value ? 'selected' : ''}`}
                                onClick={() => handleSelect(option.value)}
                            >
                                {value === option.value
                                    ? <FiCheck style={{ fontSize: '0.9rem', flexShrink: 0 }} />
                                    : <span style={{ width: '0.9rem', flexShrink: 0 }} />
                                }
                                <span>{option.name}</span>
                            </div>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default CustomDropdown;
