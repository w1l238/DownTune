import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toggleFavorite, bulkLike } from '../libraryManager.js';

describe('toggleFavorite', () => {
  test('adds an id that is not favorited', async () => {
    const result = await toggleFavorite('test-song-add');
    assert.equal(result, true);
    // clean up
    await toggleFavorite('test-song-add');
  });

  test('removes an id that is already favorited', async () => {
    await toggleFavorite('test-song-remove');
    const result = await toggleFavorite('test-song-remove');
    assert.equal(result, false);
  });
});

describe('bulkLike', () => {
  test('adds multiple ids when shouldLike is true', async () => {
    await bulkLike(['bulk-a', 'bulk-b'], true);
    // toggling a liked id should remove it (returns false)
    const r = await toggleFavorite('bulk-a');
    assert.equal(r, false);
    await toggleFavorite('bulk-b');
  });

  test('removes multiple ids when shouldLike is false', async () => {
    await bulkLike(['bulk-c', 'bulk-d'], true);
    await bulkLike(['bulk-c', 'bulk-d'], false);
    // toggling an unliked id should add it (returns true)
    const r = await toggleFavorite('bulk-c');
    assert.equal(r, true);
    await toggleFavorite('bulk-c');
    await toggleFavorite('bulk-d');
  });
});
