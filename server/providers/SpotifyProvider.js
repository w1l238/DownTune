import { SongProvider } from './SongProvider.js';
import { info, error } from '../logger.js';

export class SpotifyProvider extends SongProvider {
  constructor(accessToken) {
    super();
    this.accessToken = accessToken;
  }

  getName() {
    return 'Spotify';
  }

  async search(query, limit = 20) {
    info(`Spotify Search: "${query}" (limit: ${limit})`);

    if (!this.accessToken) {
      throw new Error('Spotify access token not available.');
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        // Return in standardized format
        const items = data.tracks.items.map(track => ({
          ...track,
          trackNumber: track.track_number // Ensure frontend gets consistent field
        }));

        return {
          items,
          next: data.tracks.next,
          previous: data.tracks.previous
        };
      } else {
        error('Error searching Spotify:', data);
        throw new Error(data.error.message || 'Error searching Spotify');
      }
    } catch (err) {
      error('Network error while searching Spotify:', err);
      throw new Error('Network error while searching Spotify');
    }
  }
}
