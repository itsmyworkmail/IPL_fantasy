import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Apple touch icon — generated at /apple-icon.png by Next.js App Router.
 * Next.js automatically inserts <link rel="apple-touch-icon"> for this.
 * iOS Safari uses this when the user taps "Add to Home Screen".
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(145deg, #0a1020 0%, #0f1830 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 38,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 38,
            background: 'radial-gradient(circle at 40% 60%, rgba(99,102,241,0.35) 0%, transparent 65%)',
            display: 'flex',
          }}
        />
        <span
          style={{
            fontSize: 90,
            fontWeight: 900,
            color: '#a78bfa',
            letterSpacing: -4,
            display: 'flex',
          }}
        >
          CT
        </span>
      </div>
    ),
    { ...size },
  );
}
