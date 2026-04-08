import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — served at /manifest.webmanifest by Next.js.
 * Enables "Add to Home Screen" on Android (Chrome) and satisfies
 * the PWA installability criteria for all Chromium-based browsers.
 *
 * iOS uses the apple-icon.tsx + Apple meta tags instead of this manifest,
 * but having the manifest doesn't hurt iOS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CricTrack — IPL Fantasy',
    short_name: 'CricTrack',
    description: 'Real-time IPL fantasy cricket points tracker. Track player stats, manage your squad, and compete with friends.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#080e1a',
    theme_color: '#6366f1',
    orientation: 'portrait',
    icons: [
      {
        // Next.js generates this from src/app/icon.tsx (512×512)
        // Browser will downscale to 192 automatically
        src: '/icon.png',
        sizes: '192x192 512x512',
        type: 'image/png',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        purpose: 'any maskable' as any,
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Lobby',
        url: '/',
        description: 'Live player stats & leaderboards',
      },
      {
        name: 'My Teams',
        url: '/my-team',
        description: 'Manage your fantasy squads',
      },
      {
        name: 'Contests',
        url: '/contests',
        description: 'Private contest rooms',
      },
    ],
    // Hides Safari UI in standalone mode on iOS
    // (iOS reads display from manifest in some scenarios)
    prefer_related_applications: false,
  };
}
