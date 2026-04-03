'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

export function Sidebar() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();

  const navItems = [
    { name: 'Lobby', path: '/', icon: 'sports_football' },
    { name: 'Contests', path: '/contests', icon: 'military_tech' },
    { name: 'My Teams', path: '/my-team', icon: 'groups' },
  ];

  return (
    <aside className="w-64 h-screen sticky top-0 bg-surface-container-low border-r border-ghost-border flex flex-col pt-8 pb-6 px-4 z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-primary/20 text-primary rounded-xl flex items-center justify-center font-bold text-xl ring-1 ring-primary/30">
          CT
        </div>
        <div className="font-headline font-bold text-xl tracking-tight text-on-surface">CricTrack</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2">
        <div className="category-header px-2 mb-4">Command Center</div>
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
          
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`flex items-center gap-4 px-3 py-3 rounded-lg text-base font-semibold transition-colors ${
                isActive 
                  ? 'bg-primary-container text-on-primary-container shadow-subtle' 
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Profile / Auth */}
      <div className="mt-auto pt-6 border-t border-ghost-border px-2">
        {loading ? (
          <div className="flex animate-pulse space-x-4">
            <div className="rounded-full bg-surface-container-high h-10 w-10"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-2 bg-surface-container-high rounded w-3/4"></div>
              <div className="h-2 bg-surface-container-high rounded w-1/2"></div>
            </div>
          </div>
        ) : user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden shrink-0 border border-outline-variant">
                {profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" width={40} height={40} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary text-on-primary text-sm font-bold">
                    {profile?.display_name?.charAt(0) || user.email?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold truncate text-on-surface">
                  {profile?.display_name || user.email?.split('@')[0]}
                </span>
                <span className="text-xs text-on-surface-variant truncate border border-tertiary text-tertiary rounded-full px-2 py-[2px] inline-flex items-center justify-center w-max mt-1 font-semibold">
                  Elite Pass
                </span>
              </div>
            </div>
            <button 
              onClick={signOut}
              className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-lg hover:bg-surface-container-high ml-2"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-[1.2rem]">Logout</span>
            </button>
          </div>
        ) : (
          <Link 
            href="/login"
            className="w-full btn-ghost text-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[1.1rem]">login</span>
            Sign In
          </Link>
        )}
      </div>
    </aside>
  );
}
