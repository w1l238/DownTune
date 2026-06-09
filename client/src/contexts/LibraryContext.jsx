import React, { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useDownloads } from './DownloadContext';
import { LibraryContext } from './libraryContextBase';

export function LibraryProvider({ children }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const inFlightRef = useRef(false);
  const { lastCompletedAt } = useDownloads();

  const fetchLibrary = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const data = await apiFetch('/api/library');
      setSongs(data);
      setLastUpdate(Date.now());
    } catch { /* ignore — caller sees stale data */ }
    finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  const scanLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/library/scan');
      setSongs(data);
      setLastUpdate(Date.now());
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSong = useCallback((id, changes) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
  }, []);

  const removeSong = useCallback((id) => {
    setSongs(prev => prev.filter(s => s.id !== id));
  }, []);

  // Initial load
  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  // Auto-refresh when a download completes
  useEffect(() => {
    if (!lastCompletedAt) return;
    if (localStorage.getItem('auto_refresh_library') === 'false') return;
    fetchLibrary();
  }, [lastCompletedAt, fetchLibrary]);

  return (
    <LibraryContext.Provider value={{ songs, setSongs, loading, lastUpdate, fetchLibrary, scanLibrary, updateSong, removeSong }}>
      {children}
    </LibraryContext.Provider>
  );
}
