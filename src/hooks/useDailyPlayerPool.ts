import { useMemo } from 'react';
import { GamedayPlayer, TourFixture } from '@/types';

export interface PlayerPoolEntry {
  player_id: number;
  name: string;
  short_name: string;
  skill_name: string;
  skill_id: number;
  team_id: number;
  team_name: string;
  team_short_name: string;
  overall_points: number;
  /**
   * True if this player's `is_announced` was 'P' in their team's last
   * completed match (looked up via fantasy_gameday_players).
   * These players appear first in their column to guide team selection.
   */
  isLastMatchXI: boolean;
}

export interface DailyPlayerPool {
  /** Home team's sorted player list */
  home: PlayerPoolEntry[];
  /** Away team's sorted player list */
  away: PlayerPoolEntry[];
}

/**
 * Derives a sorted player pool for a given fixture.
 *
 * Sort order (per team column):
 *   1. Last match XI players (is_announced === 'P' in previous gameday) → by overall_points DESC
 *   2. Remaining squad → by overall_points DESC
 *
 * "Last match XI" = players who have is_announced = 'P' in fantasy_gameday_players
 * for the highest completed tour_gameday_id of a match for that team BEFORE
 * the current fixture's match_datetime.
 *
 * @param fixture        The upcoming match to build teams for
 * @param fixtures       Full fixture list (to find each team's last completed match)
 * @param allPlayers     Season-aggregate player list from the `players` table (for the squad)
 * @param gamedayPlayers Per-match records from `fantasy_gameday_players` (includes is_announced)
 */
/** Append 'Z' if the datetime string has no timezone suffix (DB stores UTC without 'Z'). */
function ensureUTC(dt: string): string {
  return /Z|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : dt + 'Z';
}

export function useDailyPlayerPool(
  fixture: TourFixture | null,
  fixtures: TourFixture[],
  allPlayers: GamedayPlayer[],
  gamedayPlayers: GamedayPlayer[],
): DailyPlayerPool {
  return useMemo(() => {
    if (!fixture) return { home: [], away: [] };

    const { home_team_id, away_team_id, match_datetime } = fixture;
    const cutoff = new Date(ensureUTC(match_datetime));

    /**
     * Derives the Last XI set for a team directly from gamedayPlayers.
     *
     * Approach (robust — doesn't rely on match_status):
     *   1. Collect all player_ids for this team from allPlayers.
     *   2. Find all gameday_ids that appear for those players in gamedayPlayers
     *      AND correspond to a fixture that is before the cutoff
     *      (using fixtures array for the datetime↔gameday_id link).
     *   3. Take the highest such gameday_id (most recent match).
     *   4. Return player_ids where is_announced === 'P' for that gameday_id.
     */
    const getLastXISet = (teamId: number): Set<number> => {
      // Step 1: team's player_ids
      const teamPlayerIds = new Set(
        allPlayers.filter(p => p.team_id === teamId).map(p => p.player_id),
      );
      if (!teamPlayerIds.size) return new Set();

      // Step 2: past fixture gameday_ids for this team
      const pastGamedayIds = new Set(
        fixtures
          .filter(f =>
            (f.home_team_id === teamId || f.away_team_id === teamId) &&
            new Date(ensureUTC(f.match_datetime)) < cutoff,
          )
          .map(f => f.tour_gameday_id),
      );
      if (!pastGamedayIds.size) return new Set();

      // Step 3: find the highest past gameday_id that has records for this team
      const teamRecords = gamedayPlayers.filter(
        gp => teamPlayerIds.has(gp.player_id) && pastGamedayIds.has(gp.gameday_id),
      );
      if (!teamRecords.length) return new Set();

      const maxGamedayId = Math.max(...teamRecords.map(gp => gp.gameday_id));

      // Step 4: players with is_announced === 'P' in that gameday
      return new Set(
        teamRecords
          .filter(gp => gp.gameday_id === maxGamedayId && gp.is_announced === 'P')
          .map(gp => gp.player_id),
      );
    };

    const homeLastXI = getLastXISet(home_team_id);
    const awayLastXI = getLastXISet(away_team_id);

    const sortFn = (a: PlayerPoolEntry, b: PlayerPoolEntry) => {
      if (a.isLastMatchXI !== b.isLastMatchXI) return a.isLastMatchXI ? -1 : 1;
      return b.overall_points - a.overall_points;
    };

    const buildColumn = (teamId: number, lastXI: Set<number>): PlayerPoolEntry[] =>
      allPlayers
        .filter(p => p.team_id === teamId)
        .map(p => ({
          player_id: p.player_id,
          name: p.name,
          short_name: p.short_name,
          skill_name: p.skill_name,
          skill_id: p.skill_id,
          team_id: p.team_id,
          team_name: p.team_name,
          team_short_name: p.team_short_name,
          overall_points: p.overall_points,
          isLastMatchXI: lastXI.has(p.player_id),
        }))
        .sort(sortFn);

    return {
      home: buildColumn(home_team_id, homeLastXI),
      away: buildColumn(away_team_id, awayLastXI),
    };
  }, [fixture, fixtures, allPlayers, gamedayPlayers]);
}
