import React, { useState, useEffect, useRef } from 'react';
import { FiLoader, FiX, FiCheck } from 'react-icons/fi';
import { useDownloads } from '../contexts/DownloadContext';
import './css/QueueDock.css';

const QueueDock = () => {
    const { downloads, removeDownload } = useDownloads();
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const leaveTimerRef = useRef(null);

    const hasAny = downloads.length > 0;

    useEffect(() => {
        if (hasAny) {
            if (leaveTimerRef.current) {
                clearTimeout(leaveTimerRef.current);
                leaveTimerRef.current = null;
            }
            setLeaving(false);
            setVisible(true);
        } else if (visible) {
            setLeaving(true);
            leaveTimerRef.current = setTimeout(() => {
                setVisible(false);
                setLeaving(false);
            }, 420);
        }
    }, [hasAny]);

    if (!visible) return null;

    const active = downloads.find(d => d.status === 'downloading');
    const queued = downloads.filter(d => d.status === 'queued');
    const done = downloads.filter(d => d.status === 'done');
    const current = active || queued[0] || done[0];
    const isDone = !active && queued.length === 0;
    const total = downloads.length;
    const position = done.length + (active ? 1 : 0);
    const showCount = total > 1;

    return (
        <div className={`dock${leaving ? ' dock-leaving' : ''}`}>
            <div className={`dock-icon${isDone ? ' dock-icon-done' : ''}`}>
                {isDone
                    ? <FiCheck size={18} />
                    : <FiLoader size={18} className="spin" />
                }
            </div>

            {current && (
                <div className="dock-meta">
                    {showCount && (
                        <div className="dock-count">
                            {isDone ? `${total} of ${total}` : `${position} of ${total}`} songs
                        </div>
                    )}
                    <div className="t">{current.trackName}</div>
                    <div className="s">{current.artist}</div>
                </div>
            )}

            <div className="dock-progress">
                <div className="dock-bar">
                    <div
                        className="dock-bar-fill"
                        style={{ width: `${active?.progress ?? (isDone ? 100 : 0)}%` }}
                    />
                </div>
                <div className="dock-pills">
                    {queued.length > 0 && (
                        <div className="queue-pill">
                            <div className="dot" />
                            <span className="lab">{queued.length} queued</span>
                        </div>
                    )}
                    {done.length > 0 && (
                        <div className="queue-pill done">
                            <div className="dot" />
                            <span className="lab">{done.length} done</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="dock-controls">
                {current && !isDone && (
                    <button
                        className="dock-btn"
                        onClick={() => removeDownload(current.id)}
                        title="Remove from queue"
                    >
                        <FiX size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default QueueDock;
