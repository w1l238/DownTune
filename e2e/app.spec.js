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
