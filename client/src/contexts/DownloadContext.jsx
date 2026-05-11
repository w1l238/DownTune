/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const DownloadContext = createContext(null);
const HISTORY_KEY = 'download_history';
const MAX_HISTORY = 200;

const EMPTY_NOTIF = { visible: false, message: '', type: '' };

const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
};

export function DownloadProvider({ children }) {
    const [downloads, setDownloads] = useState([]);
    const [history, setHistory] = useState(loadHistory);
    const [lastCompletedAt, setLastCompletedAt] = useState(null);
    const [notification, setNotification] = useState(EMPTY_NOTIF);
    const intervalsRef = useRef({});

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ visible: true, message, type });
    }, []);

    const dismissNotification = useCallback(() => {
        setNotification(EMPTY_NOTIF);
    }, []);

    const addDownload = useCallback((download) => {
        // download: { id, trackName, artist, albumName, albumArtUrl, status: 'queued' }
        setDownloads(prev => {
            if (prev.find(d => d.id === download.id)) return prev;
            return [...prev, { ...download, status: 'queued', progress: 0, addedAt: Date.now() }];
        });
    }, []);

    const updateDownload = useCallback((id, updates) => {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));

        if (updates.status === 'downloading' && !intervalsRef.current[id]) {
            let progress = updates.progress ?? 5;
            intervalsRef.current[id] = setInterval(() => {
                progress += (88 - progress) * 0.1;
                setDownloads(prev => prev.map(d =>
                    d.id === id && d.status === 'downloading'
                        ? { ...d, progress: Math.min(progress, 88) }
                        : d
                ));
            }, 400);
        }

        if (updates.status === 'done' || updates.status === 'error') {
            if (intervalsRef.current[id]) {
                clearInterval(intervalsRef.current[id]);
                delete intervalsRef.current[id];
            }
            setDownloads(prev => {
                const dl = prev.find(d => d.id === id);
                if (dl) {
                    const entry = {
                        id,
                        trackName: dl.trackName,
                        artist: dl.artist,
                        albumArtUrl: dl.albumArtUrl,
                        status: updates.status,
                        completedAt: Date.now(),
                    };
                    setHistory(prevH => {
                        const next = [entry, ...prevH.filter(h => h.id !== id)].slice(0, MAX_HISTORY);
                        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                        return next;
                    });
                }
                return prev.map(d => d.id === id ? { ...d, progress: 100 } : d);
            });
            if (updates.status === 'done') setLastCompletedAt(Date.now());
            setTimeout(() => {
                setDownloads(prev => prev.filter(d => d.id !== id));
            }, 2500);
        }
    }, []);

    const removeDownload = useCallback((id) => {
        setDownloads(prev => prev.filter(d => d.id !== id));
    }, []);

    const clearCompleted = useCallback(() => {
        setDownloads(prev => prev.filter(d => d.status !== 'done' && d.status !== 'error'));
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem(HISTORY_KEY);
    }, []);

    return (
        <DownloadContext.Provider value={{ downloads, history, lastCompletedAt, notification, showNotification, dismissNotification, addDownload, updateDownload, removeDownload, clearCompleted, clearHistory }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownloads() {
    const ctx = useContext(DownloadContext);
    if (!ctx) throw new Error('useDownloads must be used within DownloadProvider');
    return ctx;
}
