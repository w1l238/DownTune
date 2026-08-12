import { test, expect } from '@playwright/test';

test('serves app with an empty library', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Home — DownTune');
  await expect(page.getByText('Your library is empty.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('navigates and reloads an SPA route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page).toHaveTitle('Settings — DownTune');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('exposes bootstrap and library APIs', async ({ request }) => {
  const csrfResponse = await request.get('/api/csrf-token');
  expect(csrfResponse.ok()).toBeTruthy();
  await expect(csrfResponse.json()).resolves.toMatchObject({
    token: expect.stringMatching(/^[a-f0-9]{64}$/),
  });

  const libraryResponse = await request.get('/api/library');
  expect(libraryResponse.ok()).toBeTruthy();
  await expect(libraryResponse.json()).resolves.toEqual([]);

  const configResponse = await request.get('/config');
  expect(configResponse.ok()).toBeTruthy();
  await expect(configResponse.json()).resolves.toMatchObject({
    searchProvider: 'deezer',
    hasClientSecret: false,
  });
});

test('persists a dimmed static background and restores gradient animation', async ({ page }) => {
  await page.route('**/config', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/settings');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const backgroundField = page.locator('.field').filter({ hasText: 'Choose an animated gradient or static color.' });
  await backgroundField.locator('.dropdown-header').click();
  await page.getByText('Solid — Charcoal', { exact: true }).click();

  const dimField = page.locator('.field').filter({ hasText: 'Darken a static color or background image' });
  const dimSlider = dimField.locator('input[type="range"]');
  await expect(dimSlider).toBeEnabled();
  await dimSlider.fill('0.4');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

  await expect.poll(() => page.evaluate(() => ({
    background: localStorage.getItem('app_background'),
    dim: localStorage.getItem('app_bg_dim'),
  }))).toEqual({ background: '#121212', dim: '0.4' });

  await page.reload();
  await expect.poll(() => page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      color: style.backgroundColor,
      image: style.backgroundImage,
      animation: style.animationName,
      dim: document.body.style.getPropertyValue('--bg-dim'),
    };
  })).toEqual({ color: 'rgb(18, 18, 18)', image: 'none', animation: 'none', dim: '0.4' });

  await backgroundField.locator('.dropdown-header').click();
  await page.getByText('Gradient — Ocean Default', { exact: true }).click();

  await expect(dimSlider).toBeDisabled();
  await expect.poll(() => page.evaluate(() => ({
    animation: getComputedStyle(document.body).animationName,
    dim: document.body.style.getPropertyValue('--bg-dim'),
  }))).toEqual({ animation: 'gradient', dim: '0' });
});

test('releases the canvas transform after its entry animation at ultrawide widths', async ({ page }) => {
  await page.setViewportSize({ width: 5120, height: 1440 });
  await page.goto('/');
  await page.waitForTimeout(500);

  const canvas = page.locator('.canvas');
  const main = page.locator('.main');
  await expect(canvas).toHaveCSS('transform', 'none');
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect(main).toHaveCSS('backdrop-filter', 'none');
  await expect(main).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  for (const selector of ['.home-hero', '.home-search']) {
    await expect(page.locator(selector)).toHaveCSS('backdrop-filter', 'none');
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(canvas).toHaveCSS('transform', 'none');

  await page.setViewportSize({ width: 5120, height: 1440 });
  await expect(canvas).toHaveCSS('transform', 'none');

  await page.goto('/library');
  await expect(page.locator('.page-header')).toHaveCSS('backdrop-filter', 'none');

  await page.goto('/results');
  await expect(page.locator('.results-search')).toHaveCSS('backdrop-filter', 'none');
});

test('keeps structural glass surfaces unfiltered beyond 4096 physical pixels', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 3440, height: 1200 },
    deviceScaleFactor: 1.25,
  });
  const page = await context.newPage();

  await page.goto('/');
  for (const selector of ['.main', '.home-hero', '.home-search']) {
    await expect(page.locator(selector)).toHaveCSS('backdrop-filter', 'none');
  }

  for (const route of ['/albums', '/artists', '/library']) {
    await page.goto(route);
    await expect(page.locator('.page-header')).toHaveCSS('backdrop-filter', 'none');
  }

  await page.goto('/results');
  await expect(page.locator('.results-search')).toHaveCSS('backdrop-filter', 'none');

  await context.close();
});

test('accepts a YouTube URL from each search bar and shows a confirmable result', async ({ page }) => {
  const youtubeUrl = 'https://www.youtube.com/watch?v=direct123';
  const directResult = {
    tracks: {
      items: [{
        id: 'youtube-direct123',
        name: 'Drain The Blood',
        artists: [{ name: 'Silverstein' }],
        album: {
          name: 'Canonical Album',
          images: [{ url: 'https://cdn.example/cover.jpg' }],
          release_date: '2025-09-12',
        },
        trackNumber: 4,
        isYoutube: true,
        isDirectYoutube: true,
        url: youtubeUrl,
      }],
      next: null,
      previous: null,
    },
    artists: [],
    albums: [],
  };

  await page.route('**/api/search**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(directResult),
  }));
  let downloadPayload;
  await page.route('**/download-song', async route => {
    downloadPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' });
  });

  await page.goto('/');
  await page.locator('.home-search input').fill(youtubeUrl);
  await page.locator('.home-search').press('Enter');
  await expect(page.locator('.track-name', { hasText: 'Drain The Blood' })).toBeVisible();
  await expect(page.getByText('Silverstein')).toBeVisible();
  await expect(page.getByText('Canonical Album')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Artists', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Albums', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Download' }).click();
  await expect.poll(() => downloadPayload).toMatchObject({
    trackName: 'Drain The Blood',
    artistName: 'Silverstein',
    albumName: 'Canonical Album',
    albumArtUrl: 'https://cdn.example/cover.jpg',
    year: '2025',
    trackNumber: 4,
    isYoutube: true,
    url: youtubeUrl,
  });

  await page.locator('.results-search input').fill(youtubeUrl);
  await page.locator('.results-search').press('Enter');
  await expect(page.locator('.track-name', { hasText: 'Drain The Blood' })).toBeVisible();

  await page.goto('/');
  await page.locator('.side-search input').fill(youtubeUrl);
  await page.locator('.side-search').press('Enter');
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.locator('.track-name', { hasText: 'Drain The Blood' })).toBeVisible();
});
