export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-headline font-bold text-on-surface-variant animate-pulse uppercase tracking-widest">
          Loading CricTrack...
        </p>
      </div>
    </div>
  );
}
