import { useState } from 'react';
import { useDownloads } from '../contexts/DownloadContext';
import { API_BASE_URL } from '../config';

/**
 * Reusable hook for downloading a single track.
 * @param {Function} onSuccess - Called after a successful download (e.g. to refresh library state)
 */
export function useDownloadTrack(onSuccess) {
    const [downloading, setDownloading] = useState({});
    const { addDownload, updateDownload, showNotification } = useDownloads();

    const handleDownload = async (track) => {
        const id = track.id;
        setDownloading(prev => ({ ...prev, [id]: true }));

        const trackDetails = {
            trackName: track.name,
            artistName: track.artists.map(a => a.name).join(', '),
            albumName: track.album.name,
            albumArtUrl: track.album.images[0]?.url,
            year: track.album.release_date?.substring(0, 4),
            trackNumber: track.trackNumber,
            isYoutube: track.isYoutube,
            isDeezer: track.isDeezer,
            url: track.url,
        };

        addDownload({
            id,
            trackName: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumArtUrl: track.album.images[0]?.url,
            status: 'queued',
        });
        updateDownload(id, { status: 'downloading', progress: 5 });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

        try {
            const res = await fetch(`${API_BASE_URL}/download-song`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackDetails),
                signal: controller.signal,
            });
            const data = await res.json();
            if (res.ok) {
                updateDownload(id, { status: 'done', progress: 100 });
                showNotification(
                    data.status === 'exists' ? 'Song already downloaded' : 'Download successful!',
                    data.status === 'exists' ? 'info' : 'success',
                );
                onSuccess?.();
            } else {
                updateDownload(id, { status: 'error', progress: 0 });
                showNotification(data.error || 'Download failed.', 'error');
            }
        } catch (err) {
            updateDownload(id, { status: 'error', progress: 0 });
            showNotification(
                err?.name === 'AbortError' ? 'Download timed out after 10 minutes.' : 'Download failed.',
                'error',
            );
        } finally {
            clearTimeout(timeoutId);
            setDownloading(prev => ({ ...prev, [id]: false }));
        }
    };

    return { downloading, handleDownload };
}
