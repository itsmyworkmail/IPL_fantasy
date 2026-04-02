'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, signInWithGoogle } = useAuth();
  
  const navItems = [
    { href: '/', icon: 'sports_football', label: 'Lobby' },
    { href: '/contests', icon: 'military_tech', label: 'Contests' },
    // Removed Leaderboard per previous request
    { href: '/my-team', icon: 'groups', label: 'My Teams' },
  ];

  return (
    <div className="bg-surface text-on-surface min-h-screen font-body">
      {/* SideNavBar */}
      <nav className="h-screen w-64 fixed left-0 top-0 bg-[#131b2e] dark:bg-[#131b2e] flex flex-col py-8 px-4 gap-y-6 z-50 overflow-y-auto">
        <div className="px-4 mb-4">
          <h1 className="text-indigo-400 font-black font-headline text-2xl tracking-tighter">CRICTRACK</h1>
          <p className="font-headline uppercase tracking-widest text-[10px] font-bold text-slate-500 mt-1">IPL FANTASY POINTS TRACKER</p>
        </div>
        <div className="flex flex-col gap-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            
            if (isActive) {
              return (
                <Link key={item.href} href={item.href} className="flex items-center gap-x-3 px-4 py-3 text-[#c0c1ff] bg-[#222a3d] rounded-lg border-l-4 border-[#6366F1] scale-105 duration-200 ease-out group">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="font-headline uppercase tracking-widest text-[10px] font-bold">{item.label}</span>
                </Link>
              );
            }
            
            return (
              <Link 
                key={item.href} 
                href={(!user && item.href !== '/') ? "#" : item.href} 
                onClick={(e) => {
                  if (!user && item.href !== '/') {
                    e.preventDefault();
                    signInWithGoogle();
                  }
                }}
                className="flex items-center gap-x-3 px-4 py-3 text-slate-500 hover:text-slate-200 hover:bg-[#222a3d] group transition-all duration-200 rounded-lg"
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-headline uppercase tracking-widest text-[10px] font-bold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Container */}
      <div className="pl-64 flex flex-col min-h-screen">
        
        {/* TopNavBar */}
        <header className="w-full h-16 sticky top-0 z-40 bg-[#0b1326] dark:bg-[#0b1326] flex justify-between items-center px-8 backdrop-blur-xl bg-opacity-60 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-6">
            <span className="font-headline font-black tracking-tighter text-2xl text-transparent bg-clip-text bg-gradient-to-r from-[#c0c1ff] to-[#8083ff]">CRICTRACK</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-outline-variant/20 pr-6">
              <span className="material-symbols-outlined text-slate-400 cursor-pointer hover:text-primary transition-colors">notifications</span>
              <span className="material-symbols-outlined text-slate-400 cursor-pointer hover:text-primary transition-colors">settings</span>
            </div>
            
            {user ? (
              <div className="flex flex-col md:flex-row items-center gap-3">
                <button 
                  onClick={() => signOut()} 
                  className="order-2 md:order-1 text-[10px] text-slate-500 hover:text-primary transition-colors tracking-widest uppercase font-bold mr-2"
                >
                  Logout
                </button>
                <div className="flex flex-col items-end order-1 md:order-2">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-primary">Pro Member</span>
                  <span className="text-xs font-medium text-on-surface">{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center border-2 border-surface-container-high overflow-hidden order-3">
                  {user.user_metadata?.avatar_url ? (
                    <Image alt="User profile avatar" className="w-full h-full object-cover" src={user.user_metadata.avatar_url} width={40} height={40} />
                  ) : (
                    <span className="material-symbols-outlined text-on-primary-container">person</span>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={() => signInWithGoogle()} className="text-xs font-bold bg-primary text-on-primary-fixed px-4 py-2 rounded-lg hover:bg-primary-container transition-colors tracking-widest uppercase">
                Login
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Route Content */}
        <main className="p-8 space-y-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
