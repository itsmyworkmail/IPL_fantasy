'use client';

import { useState } from 'react';
import { X, Trophy, Calendar, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface ContestConfig {
  name: string;
  description: string;
  contestType: 'simple' | 'daily';
  numMatches: number | null; // null = max/unlimited
  constraints: {
    captain_vc: boolean;
    min_batsmen: number;
    min_bowlers: number;
    min_all_rounders: number;
    min_wicket_keepers: number;
  };
}

interface ContestConfigSheetProps {
  /** Pre-filled from step 1 */
  initialName: string;
  onClose: () => void;
  onSubmit: (config: ContestConfig) => Promise<void>;
  isSubmitting: boolean;
}

const MAX_MATCHES = 70;

function Stepper({
  label, value, min = 1, max = 3,
  onChange,
}: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-lg font-bold transition-colors"
          disabled={value <= min}
        >−</button>
        <span className="w-5 text-center font-bold text-white tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-lg font-bold transition-colors"
          disabled={value >= max}
        >+</button>
      </div>
    </div>
  );
}

export function ContestConfigSheet({ initialName, onClose, onSubmit, isSubmitting }: ContestConfigSheetProps) {
  const [config, setConfig] = useState<ContestConfig>({
    name: initialName,
    description: '',
    contestType: 'simple',
    numMatches: null, // null = max
    constraints: {
      captain_vc: false,
      min_batsmen: 1,
      min_bowlers: 2,
      min_all_rounders: 1,
      min_wicket_keepers: 1,
    },
  });

  const isMaxMatches = config.numMatches === null;

  const setConstraint = (key: keyof typeof config.constraints, value: number | boolean) => {
    setConfig(prev => ({ ...prev, constraints: { ...prev.constraints, [key]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.name.trim()) return;
    await onSubmit(config);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div className="relative w-full max-w-lg md:rounded-2xl rounded-t-2xl bg-surface-container border border-white/10 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(99,102,241,0.15)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="font-headline text-lg font-black text-white">Configure Contest</h2>
            <p className="text-xs text-slate-500 mt-0.5">Set up your contest before creating</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-5 py-4 space-y-5">

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Title *</label>
              <input
                value={config.name}
                onChange={e => setConfig(p => ({ ...p, name: e.target.value }))}
                placeholder="Contest name"
                required
                className="w-full bg-surface-container-high border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Subtitle <span className="text-slate-700 normal-case font-normal">optional</span></label>
              <input
                value={config.description}
                onChange={e => setConfig(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g. IPL 2025 Season League"
                className="w-full bg-surface-container-high border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>

            {/* Contest Type */}
            <div className="space-y-2">
              <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Contest Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {(['simple', 'daily'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setConfig(p => ({ ...p, contestType: type }))}
                    className={`relative rounded-xl border p-4 text-left transition-all ${
                      config.contestType === type
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-white/8 bg-surface-container-high hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {type === 'simple'
                        ? <Trophy size={14} className={config.contestType === 'simple' ? 'text-indigo-400' : 'text-slate-500'} />
                        : <Calendar size={14} className={config.contestType === 'daily' ? 'text-violet-400' : 'text-slate-500'} />
                      }
                      <span className={`text-xs font-black uppercase tracking-wider ${
                        config.contestType === type ? 'text-white' : 'text-slate-500'
                      }`}>{type}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">
                      {type === 'simple'
                        ? 'Season-long. Teams stay fixed.'
                        : 'Pick a new team before each match.'}
                    </p>
                    {config.contestType === type && (
                      <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily-only settings */}
            {config.contestType === 'daily' && (
              <div className="space-y-4 pt-1">

                {/* Num Matches */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black tracking-widest uppercase text-slate-500">Match Count</label>
                    <button
                      type="button"
                      onClick={() => setConfig(p => ({ ...p, numMatches: p.numMatches === null ? MAX_MATCHES : null }))}
                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                        isMaxMatches
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                          : 'bg-white/5 text-slate-500 border border-white/8 hover:border-white/15'
                      }`}
                    >
                      {isMaxMatches ? '✓ MAX' : 'Set MAX'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <input
                      type="range"
                      min={1}
                      max={MAX_MATCHES}
                      value={config.numMatches ?? MAX_MATCHES}
                      onChange={e => setConfig(p => ({ ...p, numMatches: Number(e.target.value) }))}
                      disabled={isMaxMatches}
                      className="w-full accent-indigo-500 disabled:opacity-40"
                    />
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>1 match</span>
                      <span className={`font-bold ${isMaxMatches ? 'text-indigo-400' : 'text-white'}`}>
                        {isMaxMatches ? `Max (${MAX_MATCHES})` : `${config.numMatches} matches`}
                      </span>
                      <span>{MAX_MATCHES} matches</span>
                    </div>
                  </div>
                </div>

                {/* Captain / VC toggle */}
                <div className="bg-surface-container-high rounded-xl border border-white/8 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-bold text-white">Captain / Vice-Captain</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Captain 2× · Vice-Captain 1.5× points</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConstraint('captain_vc', !config.constraints.captain_vc)}
                      className={`relative w-11 h-6 rounded-full transition-all ${config.constraints.captain_vc ? 'bg-indigo-500' : 'bg-white/10'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${config.constraints.captain_vc ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>

                {/* Team Composition Constraints */}
                <div className="bg-surface-container-high rounded-xl border border-white/8 p-4">
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-1">Team Composition</p>
                  <p className="text-[10px] text-slate-600 mb-3 flex items-center gap-1"><Info size={10} /> Min 1 player from each team is always enforced</p>
                  <Stepper label="Min Batsmen" value={config.constraints.min_batsmen} onChange={v => setConstraint('min_batsmen', v)} />
                  <Stepper label="Min Bowlers" value={config.constraints.min_bowlers} onChange={v => setConstraint('min_bowlers', v)} />
                  <Stepper label="Min All-rounders" value={config.constraints.min_all_rounders} onChange={v => setConstraint('min_all_rounders', v)} />
                  <Stepper label="Min Wicket-Keepers" value={config.constraints.min_wicket_keepers} onChange={v => setConstraint('min_wicket_keepers', v)} />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Fixed footer */}
        <div className="shrink-0 px-5 py-4 border-t border-white/8 bg-surface-container">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !config.name.trim()}
            className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all
              bg-gradient-to-r from-indigo-500 to-violet-500 text-white
              hover:from-indigo-400 hover:to-violet-400 active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
          >
            {isSubmitting
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</span>
              : `Create ${config.contestType === 'daily' ? 'Daily' : ''} Contest →`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
