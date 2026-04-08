import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/**
 * App icon — generated at /icon.png by Next.js App Router.
 * Referenced in manifest.ts for Android PWA install.
 */
export default function Icon() {
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
          position: 'relative',
        }}
      >
        {/* Radial glow behind text */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Monogram */}
          <span
            style={{
              fontSize: 260,
              fontWeight: 900,
              color: '#a78bfa',
              lineHeight: 0.88,
              letterSpacing: -10,
              display: 'flex',
            }}
          >
            CT
          </span>
          {/* Accent bar */}
          <div
            style={{
              width: 80,
              height: 5,
              borderRadius: 3,
              background: '#6366f1',
              marginTop: 24,
              display: 'flex',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
