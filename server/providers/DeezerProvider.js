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
            release_date: undefined
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

  // ── Shared track normalizer (search results shape) ──────────────────
  _normalizeTrack(track, albumOverride = null) {
    const album = albumOverride || track.album || {};
    return {
      id: `deezer-${track.id}`,
      name: track.title,
      trackNumber: track.track_position,
      artists: [{ name: (track.artist || {}).name || albumOverride?.artist || 'Unknown' }],
      album: {
        name: album.name || album.title || 'Unknown Album',
        images: [
          { url: album.cover_xl   || album.images?.[0]?.url, height: 1000, width: 1000 },
          { url: album.cover_medium, height: 250, width: 250 },
          { url: album.cover_small,  height: 56,  width: 56  },
        ].filter(img => img.url),
        release_date: album.release_date,
      },
      isDeezer: true,
      url: track.link,
    };
  }

  async searchAll(query, limit = 20) {
    info(`Deezer SearchAll: "${query}" (limit: ${limit})`);
    try {
      const q = encodeURIComponent(query);
      const [trackRes, artistRes, albumRes] = await Promise.all([
        fetch(`https://api.deezer.com/search?q=${q}&limit=${limit}`),
        fetch(`https://api.deezer.com/search/artist?q=${q}&limit=10`),
        fetch(`https://api.deezer.com/search/album?q=${q}&limit=10`),
      ]);
      const [trackData, artistData, albumData] = await Promise.all([
        trackRes.json(), artistRes.json(), albumRes.json(),
      ]);

      const tracks = {
        items: (trackData.data || []).map(t => this._normalizeTrack(t)),
        next: trackData.next || null,
        previous: trackData.prev || null,
      };

      const artists = (artistData.data || []).map(a => ({
        id: a.id,
        name: a.name,
        pictureUrl: a.picture_xl || a.picture_big || a.picture_medium || null,
        albumCount: a.nb_album ?? null,
        fanCount: a.nb_fan ?? null,
      }));

      const albums = (albumData.data || []).map(a => ({
        id: a.id,
        title: a.title,
        coverUrl: a.cover_xl || a.cover_big || null,
        artist: a.artist?.name || 'Unknown',
        trackCount: a.nb_tracks ?? null,
        releaseDate: a.release_date || null,
      }));

      return { tracks, artists, albums };
    } catch (err) {
      error('Error in Deezer searchAll:', err);
      throw new Error('Error searching Deezer');
    }
  }

  async getArtist(id) {
    info(`Deezer getArtist: ${id}`);
    try {
      const [artistRes, topRes, albumsRes] = await Promise.all([
        fetch(`https://api.deezer.com/artist/${id}`),
        fetch(`https://api.deezer.com/artist/${id}/top?limit=10`),
        fetch(`https://api.deezer.com/artist/${id}/albums?limit=50`),
      ]);
      const [artistData, topData, albumsData] = await Promise.all([
        artistRes.json(), topRes.json(), albumsRes.json(),
      ]);

      if (artistData.error) throw new Error(artistData.error.message || 'Artist not found');

      const artist = {
        id: artistData.id,
        name: artistData.name,
        picture: artistData.picture_xl || artistData.picture_big || null,
        nbAlbum: artistData.nb_album ?? null,
        nbFan: artistData.nb_fan ?? null,
      };

      const topTracks = (topData.data || []).map(t => this._normalizeTrack(t));

      const albums = (albumsData.data || []).map(a => ({
        id: a.id,
        title: a.title,
        coverUrl: a.cover_xl || a.cover_big || null,
        nbTracks: a.nb_tracks ?? null,
        releaseDate: a.release_date || null,
      }));

      return { artist, topTracks, albums };
    } catch (err) {
      error(`Error in Deezer getArtist(${id}):`, err);
      throw new Error('Error fetching artist from Deezer');
    }
  }

  async getAlbum(id) {
    info(`Deezer getAlbum: ${id}`);
    try {
      const res = await fetch(`https://api.deezer.com/album/${id}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message || 'Album not found');

      const album = {
        id: data.id,
        title: data.title,
        coverUrl: data.cover_xl || data.cover_big || null,
        artist: data.artist?.name || 'Unknown',
        releaseDate: data.release_date || null,
        nbTracks: data.nb_tracks ?? 0,
      };

      // Album-endpoint tracks lack a nested album object — inject from parent
      const albumOverride = {
        name: data.title,
        cover_xl: data.cover_xl,
        release_date: data.release_date,
        artist: data.artist?.name,
      };

      const tracks = (data.tracks?.data || []).map(t => this._normalizeTrack(t, albumOverride));

      return { album, tracks };
    } catch (err) {
      error(`Error in Deezer getAlbum(${id}):`, err);
      throw new Error('Error fetching album from Deezer');
    }
  }
}
