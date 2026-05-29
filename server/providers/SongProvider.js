export class SongProvider {
  /**
   * Search for songs based on a query.
   * @param {string} query The search query.
   * @param {number} limit The maximum number of results.
   * @returns {Promise<Object>} The search results in a unified format.
   */
  async search(query, limit) {
    throw new Error('Method search() must be implemented.');
  }

  /**
   * Get the name of the provider.
   * @returns {string}
   */
  getName() {
    throw new Error('Method getName() must be implemented.');
  }

  /**
   * Search for tracks, artists, and albums in one call.
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<{tracks, artists, albums}>}
   */
  async searchAll(query, limit) {
    throw new Error('Method searchAll() must be implemented.');
  }

  /**
   * Get artist details, top tracks, and albums.
   * @param {string|number} id
   */
  async getArtist(id) {
    throw new Error('Method getArtist() must be implemented.');
  }

  /**
   * Get album details and all tracks.
   * @param {string|number} id
   */
  async getAlbum(id) {
    throw new Error('Method getAlbum() must be implemented.');
  }
}
