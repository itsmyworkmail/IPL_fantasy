import { DesktopLayout } from '@/components/DesktopLayout';
import { MobileShell } from '@/components/MobileShell';
import { Toaster } from 'react-hot-toast';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* ── Desktop layout: sidebar + top header (≥ md) ── */}
      <div className="hidden md:block">
        <DesktopLayout>{children}</DesktopLayout>
      </div>

      {/* ── Mobile layout: top app bar + bottom nav (< md) ── */}
      <div className="md:hidden">
        <MobileShell>{children}</MobileShell>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
          },
          success: {
            iconTheme: {
              primary: '#818cf8',
              secondary: '#1e293b',
            },
          },
        }}
      />
    </>
  );
}
