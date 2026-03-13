import { SongProvider } from './SongProvider.js';
import { info, error } from '../logger.js';

export class DeezerProvider extends SongProvider {
  getName() {
    return 'Deezer';
  }

  async search(query, limit = 20) {
    info(`Deezer Search: "${query}" (limit: ${limit})`);

    try {
      const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Error searching Deezer');
      }

      const items = (data.data || []).map(track => {
        return {
          id: `deezer-${track.id}`,
          name: track.title,
          trackNumber: track.track_position,
          artists: [
            { name: track.artist.name }
          ],
          album: {
            name: track.album.title,
            images: [
              { url: track.album.cover_xl, height: 1000, width: 1000 },
              { url: track.album.cover_medium, height: 250, width: 250 },
              { url: track.album.cover_small, height: 56, width: 56 }
            ].filter(img => img.url),
            release_date: undefined // Deezer search doesn't return year, but we'll fetch it during download if needed
          },
          isDeezer: true,
          url: track.link
        };
      });

      return { 
        items,
        next: data.next,
        previous: data.prev
      };
    } catch (err) {
      error('Error searching Deezer:', err);
      throw new Error('Error searching Deezer');
    }
  }
}
