export type ColorMode = 'light' | 'dark' | 'system';

export const SETTINGS_KEY = 'estara.demo.account-settings.v1';

export function getSavedColorMode(): ColorMode {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as {
      preferences?: { colorMode?: unknown };
    };
    const value = saved?.preferences?.colorMode;
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyColorMode(mode: ColorMode): void {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themeChoice = mode;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  themeMeta?.setAttribute('content', dark ? '#0d1928' : '#ffffff');
}

export function initializeAppearance(): void {
  // Ignore removed density/motion settings from older local browser preferences.
  delete document.documentElement.dataset.density;
  delete document.documentElement.dataset.reduceMotion;
  applyColorMode(getSavedColorMode());
  // System mode follows Windows/macOS/browser theme changes without a page reload.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSavedColorMode() === 'system') applyColorMode('system');
  });
}
