'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { Trophy, Users, Bell, Settings, LogOut, User, LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Lobby', description: 'Live overview' },
  { href: '/contests', icon: Trophy, label: 'Contests', description: 'Rooms & leagues' },
  { href: '/my-team', icon: Users, label: 'My Teams', description: 'Draft & manage' },
];

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, signInWithGoogle } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageTitle = pathname === '/' ? 'LOBBY'
    : pathname.startsWith('/contests') ? 'CONTESTS'
    : pathname.startsWith('/my-team') ? 'MY TEAMS'
    : 'LOBBY';

  return (
    <div className="bg-surface text-on-surface min-h-screen font-body flex relative">

      {/* ── Sidebar ── */}
      <aside
        className={`fixed left-0 top-0 h-screen flex flex-col z-50 transition-all duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-64'}`}
        style={{
          background: 'linear-gradient(180deg, #0d1526 0%, #0b1220 50%, #080e1a 100%)',
          borderRight: '1px solid rgba(99,102,241,0.1)',
          boxShadow: '4px 0 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Subtle top glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-white/5 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 font-black font-headline text-xl tracking-tighter leading-none">
                CRICTRACK
              </span>
              <span className="text-[9px] font-bold text-slate-600 tracking-[0.25em] uppercase mt-0.5">IPL Fantasy</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="text-white font-black text-xs font-headline">CT</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const isLocked = !user && item.href !== '/';
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={isLocked ? '#' : item.href}
                onClick={(e) => { if (isLocked) { e.preventDefault(); signInWithGoogle(); } }}
                title={collapsed ? item.label : undefined}
                className={`
                  relative flex items-center gap-3 rounded-xl transition-all duration-200 group overflow-hidden
                  ${collapsed ? 'px-0 py-3 justify-center' : 'px-4 py-3'}
                  ${isActive
                    ? 'bg-gradient-to-r from-indigo-600/30 to-violet-600/10 border border-indigo-500/30 text-white shadow-lg shadow-indigo-500/10'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'}
                `}
              >
                {/* Active left accent */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-indigo-400 to-violet-500 rounded-full" />
                )}

                {/* Icon with glow for active */}
                <span className={`relative flex-shrink-0 transition-colors ${isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {isActive && (
                    <span className="absolute inset-0 blur-sm bg-indigo-400/40 rounded" />
                  )}
                  <Icon className="w-[18px] h-[18px] relative z-10" />
                </span>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] font-bold tracking-[0.1em] uppercase leading-none ${isActive ? 'text-white' : ''}`}>
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5 leading-none">
                      {item.description}
                    </div>
                  </div>
                )}

                {isLocked && !collapsed && (
                  <span className="text-[8px] font-bold text-slate-600 border border-slate-700 rounded px-1 py-0.5 uppercase tracking-wider">
                    Login
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

        {/* Profile Section */}
        <div className="px-3 py-4">
          {user ? (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className={`w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-white/5 transition-all group ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? (user.user_metadata?.full_name || user.email || 'Profile') : undefined}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center overflow-hidden ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/20">
                    {user.user_metadata?.avatar_url
                      ? <Image alt="Avatar" className="w-full h-full object-cover" src={user.user_metadata.avatar_url} width={32} height={32} />
                      : <User className="w-4 h-4 text-white" />
                    }
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0b1220] shadow-sm" />
                </div>
                {!collapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate leading-none">
                      {user.user_metadata?.full_name || user.email?.split('@')[0]}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 truncate">Player</p>
                  </div>
                )}
              </button>

              {/* Profile Dropdown */}
              {profileOpen && (
                <div className={`absolute bottom-full mb-2 ${collapsed ? 'left-full ml-2 w-56' : 'left-0 right-0 w-full'} bg-[#131d30] border border-indigo-500/20 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50`}>
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-sm font-bold text-white truncate">{user.user_metadata?.full_name || 'Player'}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                  </div>
                  <div className="p-2 space-y-1">
                    <button className="flex items-center w-full gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left group">
                      <Bell className="w-4 h-4 text-slate-600 group-hover:text-indigo-400" />
                      Notifications
                    </button>
                    <button className="flex items-center w-full gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left group">
                      <Settings className="w-4 h-4 text-slate-600 group-hover:text-indigo-400" />
                      Settings
                    </button>
                    <div className="h-px bg-white/5 my-1" />
                    <button
                      onClick={() => { setProfileOpen(false); signOut(); }}
                      className="flex items-center w-full gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className={`w-full flex items-center gap-2 justify-center bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-bold tracking-widest uppercase rounded-xl transition-all hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 ${collapsed ? 'p-2.5' : 'px-4 py-2.5'}`}
              title={collapsed ? 'Login' : undefined}
            >
              {collapsed ? <User className="w-4 h-4" /> : 'Login via Google'}
            </button>
          )}
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-[#131d30] border border-indigo-500/20 rounded-full flex items-center justify-center text-slate-400 hover:text-white shadow-lg hover:bg-indigo-600/20 transition-all z-10"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* ── Main Container ── */}
      <div className={`flex flex-col min-h-screen transition-all duration-300 ease-in-out ${collapsed ? 'pl-[72px]' : 'pl-64'} w-full`}>

        {/* Top Header */}
        <header
          className="w-full h-14 sticky top-0 z-40 flex items-center justify-between px-8"
          style={{
            background: 'rgba(8,14,26,0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          <span className="font-headline font-black tracking-tighter text-xl text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400">
            {pageTitle}
          </span>

          {user && (
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
              <span className="text-xs text-slate-500 font-medium hidden md:block">
                {user.user_metadata?.full_name?.split(' ')[0] || 'Player'}
              </span>
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="px-6 py-8 md:px-10 md:py-10 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
