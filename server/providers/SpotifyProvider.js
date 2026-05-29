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

  _headers() {
    return { 'Authorization': `Bearer ${this.accessToken}` };
  }

  _assertToken() {
    if (!this.accessToken) throw new Error('Spotify access token not available.');
  }

  _normalizeTrack(track) {
    return {
      id: track.id,
      name: track.name,
      trackNumber: track.track_number,
      artists: track.artists.map(a => ({ name: a.name })),
      album: {
        name: track.album?.name || 'Unknown Album',
        images: track.album?.images || [],
        release_date: track.album?.release_date,
      },
      url: track.external_urls?.spotify,
    };
  }

  async search(query, limit = 20) {
    info(`Spotify Search: "${query}" (limit: ${limit})`);
    this._assertToken();

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        { headers: this._headers() }
      );

      const data = await response.json();
      if (response.ok) {
        const items = data.tracks.items.map(track => ({
          ...track,
          trackNumber: track.track_number,
        }));
        return { items, next: data.tracks.next, previous: data.tracks.previous };
      } else {
        error('Error searching Spotify:', data);
        throw new Error(data.error.message || 'Error searching Spotify');
      }
    } catch (err) {
      error('Network error while searching Spotify:', err);
      throw new Error('Network error while searching Spotify');
    }
  }

  async searchAll(query, limit = 20) {
    info(`Spotify SearchAll: "${query}" (limit: ${limit})`);
    this._assertToken();

    try {
      const q = encodeURIComponent(query);
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track,artist,album&limit=${limit}`,
        { headers: this._headers() }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Error searching Spotify');

      const tracks = {
        items: data.tracks.items.map(t => this._normalizeTrack(t)),
        next: data.tracks.next || null,
        previous: data.tracks.previous || null,
      };

      const artists = (data.artists?.items || []).map(a => ({
        id: a.id,
        name: a.name,
        pictureUrl: a.images?.[0]?.url || null,
        albumCount: null,
        fanCount: a.followers?.total ?? null,
      }));

      const albums = (data.albums?.items || []).map(a => ({
        id: a.id,
        title: a.name,
        coverUrl: a.images?.[0]?.url || null,
        artist: a.artists?.[0]?.name || 'Unknown',
        trackCount: a.total_tracks ?? null,
        releaseDate: a.release_date || null,
      }));

      return { tracks, artists, albums };
    } catch (err) {
      error('Error in Spotify searchAll:', err);
      throw new Error('Error searching Spotify');
    }
  }

  async getArtist(id) {
    info(`Spotify getArtist: ${id}`);
    this._assertToken();

    try {
      const [artistRes, topRes, albumsRes] = await Promise.all([
        fetch(`https://api.spotify.com/v1/artists/${id}`, { headers: this._headers() }),
        fetch(`https://api.spotify.com/v1/artists/${id}/top-tracks?market=US`, { headers: this._headers() }),
        fetch(`https://api.spotify.com/v1/artists/${id}/albums?include_groups=album,single&limit=50`, { headers: this._headers() }),
      ]);
      const [artistData, topData, albumsData] = await Promise.all([
        artistRes.json(), topRes.json(), albumsRes.json(),
      ]);

      if (!artistRes.ok) throw new Error(artistData.error?.message || 'Artist not found');

      const artist = {
        id: artistData.id,
        name: artistData.name,
        picture: artistData.images?.[0]?.url || null,
        nbAlbum: albumsData.total ?? null,
        nbFan: artistData.followers?.total ?? null,
      };

      const topTracks = (topData.tracks || []).map(t => this._normalizeTrack(t));

      const albums = (albumsData.items || []).map(a => ({
        id: a.id,
        title: a.name,
        coverUrl: a.images?.[0]?.url || null,
        nbTracks: a.total_tracks ?? null,
        releaseDate: a.release_date || null,
      }));

      return { artist, topTracks, albums };
    } catch (err) {
      error(`Error in Spotify getArtist(${id}):`, err);
      throw new Error('Error fetching artist from Spotify');
    }
  }

  async getAlbum(id) {
    info(`Spotify getAlbum: ${id}`);
    this._assertToken();

    try {
      const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers: this._headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Album not found');

      const album = {
        id: data.id,
        title: data.name,
        coverUrl: data.images?.[0]?.url || null,
        artist: data.artists?.[0]?.name || 'Unknown',
        releaseDate: data.release_date || null,
        nbTracks: data.total_tracks ?? 0,
      };

      const albumOverride = {
        name: data.name,
        images: data.images || [],
        release_date: data.release_date,
      };

      const tracks = (data.tracks?.items || []).map(t => this._normalizeTrack({ ...t, album: albumOverride }));

      return { album, tracks };
    } catch (err) {
      error(`Error in Spotify getAlbum(${id}):`, err);
      throw new Error('Error fetching album from Spotify');
    }
  }
}
