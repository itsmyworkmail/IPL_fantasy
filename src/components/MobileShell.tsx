'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { LogOut, User, Sword, Trophy, Users } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', Icon: Sword, label: 'Lobby' },
  { href: '/contests', Icon: Trophy, label: 'Contests' },
  { href: '/my-team', Icon: Users, label: 'My Teams' },
] as const;

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signInWithGoogle, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-background text-on-background min-h-screen font-body">

      {/* ── Fixed Top App Bar ── */}
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-14"
        style={{
          background: 'rgba(11,14,20,0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 2px 20px rgba(0,0,0,0.4)',
        }}
      >
        <h1 className="text-lg font-black italic tracking-tighter text-primary font-headline leading-none">
          CricTrack
        </h1>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => user ? setMenuOpen(o => !o) : signInWithGoogle()}
            className="w-9 h-9 rounded-full border-2 border-primary/40 overflow-hidden flex-shrink-0 active:scale-90 transition-transform"
          >
            {user?.user_metadata?.avatar_url ? (
              <Image
                src={user.user_metadata.avatar_url}
                alt="avatar"
                width={36}
                height={36}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
            )}
          </button>

          {menuOpen && user && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded-2xl py-2 z-[9999]"
              style={{
                background: 'rgba(18,24,38,0.98)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="px-4 py-2.5 border-b border-white/[0.08]">
                <p className="text-xs font-bold text-on-surface truncate">
                  {user.user_metadata?.full_name || user.email || 'User'}
                </p>
                <p className="text-[9px] text-slate-500 truncate mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); signOut?.(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Scrollable Page Content ── */}
      <main className="pt-16 pb-24">
        {children}
      </main>

      {/* ── Fixed Bottom Nav Bar ── */}
      <nav
        className="fixed bottom-0 w-full z-50 rounded-t-2xl border-t border-white/5 flex justify-around items-center pt-2 pb-5 px-4 h-[68px]"
        style={{
          background: 'rgba(11,14,20,0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
        }}
      >
        {NAV_ITEMS.map(({ href, Icon, label }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 relative transition-all duration-200 active:scale-90 min-w-[56px] ${
                isActive ? 'text-primary' : 'text-slate-500'
              }`}
            >
              {isActive && (
                <span
                  className="absolute -top-1 w-10 h-6 rounded-full pointer-events-none"
                  style={{ background: 'rgba(99,102,241,0.15)' }}
                />
              )}
              <Icon
                className="relative z-10"
                size={20}
                strokeWidth={isActive ? 2.5 : 1.8}
                fill={isActive ? 'currentColor' : 'none'}
              />
              <span className="text-[8px] font-black uppercase tracking-[0.1em] relative z-10">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
