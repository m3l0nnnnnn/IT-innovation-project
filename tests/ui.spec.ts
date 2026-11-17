import { test, expect } from '@playwright/test';

test('dashboard renders the Estara application shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Estara home' })).toBeVisible();
});

test('sidebar can collapse and expand, and the preference survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('feedback navigation loads the correct page without crashing', async ({ page }) => {
  await page.goto('/cases');
  await expect(page.getByRole('heading', { name: 'Feedback cases' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New case' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overdue Cases' })).toBeVisible();
});

test('KPI overview can be opened directly', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'KPI overview' })).toBeVisible();
  await expect(page.getByText('Reporting period')).toBeVisible();
});

test('unknown routes display a recoverable 404', async ({ page }) => {
  await page.goto('/unrecognised-route');
  await expect(page.getByText('Page not found.')).toBeVisible();
  await page.getByRole('link', { name: 'Return to dashboard' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('case search and filter controls remain accessible on narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cases');
  await expect(page.getByPlaceholder('Search reference, block or description...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
  await page.getByPlaceholder('Search reference, block or description...').fill('lift');
  await expect(page.getByPlaceholder('Search reference, block or description...')).toHaveValue('lift');
});
