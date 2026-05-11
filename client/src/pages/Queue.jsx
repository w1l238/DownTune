import React, { useEffect } from 'react';
import { FiX, FiMusic, FiLoader, FiCheck, FiAlertCircle, FiTrash2 } from 'react-icons/fi';
import { useDownloads } from '../contexts/DownloadContext';
import './css/Queue.css';

const relativeTime = (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
};

const Queue = () => {
    const { downloads, history, removeDownload, clearHistory } = useDownloads();
    useEffect(() => { document.title = 'Queue — DownTune'; }, []);

    const active = downloads.filter(d => d.status === 'downloading').length;
    const queued = downloads.filter(d => d.status === 'queued').length;
    const totalDone = history.filter(h => h.status === 'done').length;
    const totalErrors = history.filter(h => h.status === 'error').length;

    return (
        <div className="queue-wrap">
            <div className="queue-header">
                <h1>Queue</h1>
                {history.length > 0 && (
                    <button className="queue-clear-btn" onClick={clearHistory} title="Clear history">
                        <FiTrash2 size={13} /> Clear history
                    </button>
                )}
            </div>

            <div className="queue-summary">
                <div className={`queue-stat ${active > 0 ? 'accent' : ''}`}>
                    <div className="stat-lab">Active</div>
                    <div className="stat-num">{active + queued}</div>
                </div>
                <div className="queue-stat">
                    <div className="stat-lab">Total</div>
                    <div className="stat-num">{history.length}</div>
                </div>
                <div className="queue-stat">
                    <div className="stat-lab">Downloaded</div>
                    <div className="stat-num">{totalDone}</div>
                </div>
                <div className="queue-stat">
                    <div className="stat-lab">Errors</div>
                    <div className="stat-num">{totalErrors}</div>
                </div>
            </div>

            {/* Live queue */}
            {downloads.length > 0 && (
                <div className="queue-section">
                    <div className="queue-section-label">In progress</div>
                    <div className="queue-rows">
                        {downloads.map((dl) => (
                            <div key={dl.id} className={`queue-row ${dl.status}`}>
                                <div className="queue-row-icon">
                                    {dl.status === 'done'
                                        ? <FiCheck size={14} />
                                        : dl.status === 'error'
                                        ? <FiAlertCircle size={14} />
                                        : <FiLoader size={14} className="spin" />
                                    }
                                </div>
                                <div className="mini-art">
                                    {dl.albumArtUrl
                                        ? <img src={dl.albumArtUrl} alt={dl.trackName} />
                                        : <FiMusic size={16} />
                                    }
                                </div>
                                <div className="info">
                                    <div className="t">{dl.trackName}</div>
                                    <div className="s">{dl.artist}</div>
                                </div>
                                <div className="progress-cell">
                                    <div className="bar">
                                        <div className="bar-fill" style={{ width: `${dl.progress ?? 0}%` }} />
                                    </div>
                                    <div className="pct">{Math.round(dl.progress ?? 0)}%</div>
                                </div>
                                <button className="queue-cancel-btn" onClick={() => removeDownload(dl.id)} title="Remove">
                                    <FiX size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* History */}
            {history.length > 0 ? (
                <div className="queue-section">
                    <div className="queue-section-label">History</div>
                    <div className="queue-rows">
                        {history.map((h) => (
                            <div key={`${h.id}-${h.completedAt}`} className={`queue-row history-row ${h.status}`}>
                                <div className="queue-row-icon">
                                    {h.status === 'done'
                                        ? <FiCheck size={14} />
                                        : <FiAlertCircle size={14} />
                                    }
                                </div>
                                <div className="mini-art">
                                    {h.albumArtUrl
                                        ? <img src={h.albumArtUrl} alt={h.trackName} />
                                        : <FiMusic size={16} />
                                    }
                                </div>
                                <div className="info">
                                    <div className="t">{h.trackName}</div>
                                    <div className="s">{h.artist}</div>
                                </div>
                                <span className={`queue-status-pill ${h.status}`}>
                                    {h.status === 'done' ? 'Downloaded' : 'Failed'}
                                </span>
                                <span className="queue-time">{relativeTime(h.completedAt)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : downloads.length === 0 && (
                <p className="queue-empty">No download history yet. Search for songs to get started.</p>
            )}
        </div>
    );
};

export default Queue;
