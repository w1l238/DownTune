import { useState } from 'react';
import { useDownloads } from '../contexts/DownloadContext';
import { apiFetch } from '../utils/apiClient';

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

        try {
            const data = await apiFetch('/download-song', {
                method: 'POST',
                body: trackDetails,
            }, 10 * 60 * 1000);
            updateDownload(id, { status: 'done', progress: 100 });
            showNotification(
                data.status === 'exists' ? 'Song already downloaded' : 'Download successful!',
                data.status === 'exists' ? 'info' : 'success',
            );
            onSuccess?.();
        } catch (err) {
            updateDownload(id, { status: 'error', progress: 0 });
            showNotification(
                err?.name === 'AbortError' ? 'Download timed out after 10 minutes.' : (err.message || 'Download failed.'),
                'error',
            );
        } finally {
            setDownloading(prev => ({ ...prev, [id]: false }));
        }
    };

    return { downloading, handleDownload };
}
