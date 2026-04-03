'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-6">
      <div className="bg-surface-container-high rounded-3xl p-10 max-w-md w-full border border-error/20 text-center shadow-2xl">
        <div className="bg-error/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
          <AlertCircle className="w-10 h-10 text-error" />
        </div>
        
        <h2 className="text-3xl font-headline font-black text-on-surface mb-3 tracking-tight">
          System Interruption
        </h2>
        
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          The application encountered an unexpected state. This has been logged for review.
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 bg-indigo-500 text-white font-bold py-4 px-4 rounded-2xl hover:bg-indigo-400 transition-all uppercase tracking-widest text-[10px]"
          >
            <RotateCcw className="w-4 h-4" /> Try Again
          </button>
          
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-surface-container-highest text-on-surface-variant font-bold py-4 px-4 rounded-2xl hover:bg-white/5 transition-all uppercase tracking-widest text-[10px] border border-white/5"
          >
            <Home className="w-4 h-4" /> Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
