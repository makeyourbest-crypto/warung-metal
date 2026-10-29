import '@testing-library/jest-dom/vitest'

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px'), // uji sebagai layar desktop
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
