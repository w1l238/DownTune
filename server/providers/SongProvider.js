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
}
