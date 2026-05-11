import { useEffect } from 'react';
import { useDownloads } from '../contexts/DownloadContext';

export function useAutoRefresh(callback) {
    const { lastCompletedAt } = useDownloads();
    useEffect(() => {
        if (!lastCompletedAt) return;
        if (localStorage.getItem('auto_refresh_library') === 'false') return;
        callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastCompletedAt]);
}
