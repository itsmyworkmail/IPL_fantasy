import { ContestConstraints } from '@/types';
import { PlayerPoolEntry } from '@/hooks/useDailyPlayerPool';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  counts: {
    bat: number;
    bwl: number;
    ar: number;
    wk: number;
    homeCount: number;
    awayCount: number;
    total: number;
  };
}

const SKILL_MAP: Record<string, 'bat' | 'bwl' | 'ar' | 'wk'> = {
  // Abbreviations
  'BAT': 'bat', 'Bat': 'bat',
  'BWL': 'bwl', 'Bowl': 'bwl',
  'AR':  'ar',
  'WK':  'wk',  'Wkt': 'wk',
  // Full names (as returned by IPL Fantasy API)
  'Batsman':        'bat',
  'Batting':        'bat',
  'Bowler':         'bwl',
  'Bowling':        'bwl',
  'All-Rounder':    'ar',
  'All Rounder':    'ar',
  'Allrounder':     'ar',
  'All_Rounder':    'ar',
  'Wicket-Keeper':  'wk',
  'Wicket Keeper':  'wk',
  'WicketKeeper':   'wk',
  'Wicketkeeper':   'wk',
};

/** Falls back to regex matching if an exact key isn't in the map. */
function normaliseSkill(skill: string): 'bat' | 'bwl' | 'ar' | 'wk' | null {
  if (SKILL_MAP[skill]) return SKILL_MAP[skill];
  const s = skill.toLowerCase();
  if (s.includes('bat')) return 'bat';
  if (s.includes('bowl') || s === 'bwl') return 'bwl';
  if (s.includes('roun') || s === 'ar') return 'ar';
  if (s.includes('wick') || s === 'wk') return 'wk';
  return null;
}


/**
 * Validates a daily contest team selection against the contest constraints.
 *
 * @param selectedIds  player_ids of currently selected players
 * @param homePool     home team's player pool (home column)
 * @param awayPool     away team's player pool (away column)
 * @param constraints  the room's contest constraints
 * @returns ValidationResult with isValid flag, error messages, and role counts
 */
export function validateDailyTeam(
  selectedIds: Set<number>,
  homePool: PlayerPoolEntry[],
  awayPool: PlayerPoolEntry[],
  constraints: ContestConstraints,
): ValidationResult {
  const allPool: PlayerPoolEntry[] = [...homePool, ...awayPool];
  const homeIds = new Set(homePool.map(p => p.player_id));
  const awayIds = new Set(awayPool.map(p => p.player_id));

  const counts = { bat: 0, bwl: 0, ar: 0, wk: 0, homeCount: 0, awayCount: 0, total: 0 };

  for (const id of selectedIds) {
    const player = allPool.find(p => p.player_id === id);
    if (!player) continue;

    counts.total++;
    if (homeIds.has(id)) counts.homeCount++;
    if (awayIds.has(id)) counts.awayCount++;

    const role = normaliseSkill(player.skill_name);
    if (role) counts[role]++;
  }

  const errors: string[] = [];

  if (counts.total !== 11) {
    errors.push(`Select exactly 11 players (${counts.total}/11)`);
  }

  const minPerTeam = constraints.min_per_team ?? 1;
  if (counts.homeCount < minPerTeam) {
    errors.push(`Pick at least ${minPerTeam} player(s) from each team`);
  }
  if (counts.awayCount < minPerTeam) {
    errors.push(`Pick at least ${minPerTeam} player(s) from each team`);
  }

  const minBat = constraints.min_batsmen ?? 1;
  if (counts.bat < minBat) errors.push(`Min ${minBat} Batsman${minBat > 1 ? 's' : ''} (have ${counts.bat})`);

  const minBwl = constraints.min_bowlers ?? 2;
  if (counts.bwl < minBwl) errors.push(`Min ${minBwl} Bowler${minBwl > 1 ? 's' : ''} (have ${counts.bwl})`);

  const minAR = constraints.min_all_rounders ?? 1;
  if (counts.ar < minAR) errors.push(`Min ${minAR} All-Rounder${minAR > 1 ? 's' : ''} (have ${counts.ar})`);

  const minWK = constraints.min_wicket_keepers ?? 1;
  if (counts.wk < minWK) errors.push(`Min ${minWK} Wicket-Keeper${minWK > 1 ? 's' : ''} (have ${counts.wk})`);

  return {
    isValid: errors.length === 0,
    errors,
    counts,
  };
}
