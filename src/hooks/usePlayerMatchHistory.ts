import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface GamedayPointEntry {
  player_id: number;
  gameday_id: number;
  gameday_points: number;
}

/**
 * Per-team relative match index:
 * - Key: team_short_name
 * - Value: ordered array of gameday_ids for that team's matches
 *   (chronologically, representing M1, M2, M3 ... M14 for that team)
 */
export type TeamScheduleMap = Record<string, number[]>;

/**
 * Per-player history: player_id -> { gameday_id -> points }
 */
export type PlayerHistoryMap = Record<number, Record<number, number>>;

/**
 * Relative column definition:
 * - colIndex: 0-based index in the final column list (M1 = 0, M2 = 1, ...)
 * - label: display label e.g. "M1"
 * - gamedayId: the global tour_gameday_id this column represents for a specific team
 *   (each team has its own mapping)
 */
export interface RelativeColumn {
  /** 0-based relative index for this team's match sequence */
  relIndex: number;
  /** e.g. "M1" */
  label: string;
}

/**
 * Final compound column structure across all teams in the squad:
 * This is the union of relative match slots (M1...M14).
 * maxRelIndex is the highest match index seen across any team in the squad.
 */

interface UsePlayerMatchHistoryReturn {
  playerHistory: PlayerHistoryMap;
  teamSchedule: TeamScheduleMap;  // team -> ordered [gamedayId] for that team (all fixtures, not just played)
  playedTeamSchedule: TeamScheduleMap; // team -> ordered [gamedayId] for that team (only played matches = those with gameday_players data)
  allGamedayIds: number[];        // global sorted set of all played gameday_ids in squad
  maxMatchCount: number;          // highest number of matches played by any squad team
  loading: boolean;
  error: string | null;
}

/**
 * Fetches match-by-match gameday_points for a given set of player_ids.
 *
 * Column logic:
 *  - M1 = the 1st match played by the player's IPL team
 *  - M2 = the 2nd match played by the player's IPL team
 *  - etc.
 *  - At end of tournament max is 14 columns
 *  - No gaps or '-': if the team played M3, the player will always have a value for M3
 *    (either their actual points or 0 if they scored nothing that game)
 */
export function usePlayerMatchHistory(
  playerIds: number[],
  teamShortNames: string[]
): UsePlayerMatchHistoryReturn {
  const [playerHistory, setPlayerHistory] = useState<PlayerHistoryMap>({});
  const [teamSchedule, setTeamSchedule] = useState<TeamScheduleMap>({});
  const [playedTeamSchedule, setPlayedTeamSchedule] = useState<TeamScheduleMap>({});
  const [allGamedayIds, setAllGamedayIds] = useState<number[]>([]);
  const [maxMatchCount, setMaxMatchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerIdsKey = playerIds.join(',');
  const teamNamesKey = teamShortNames.join(',');

  const fetchHistory = useCallback(async () => {
    if (playerIds.length === 0 || teamShortNames.length === 0) {
      setPlayerHistory({});
      setTeamSchedule({});
      setPlayedTeamSchedule({});
      setAllGamedayIds([]);
      setMaxMatchCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch ALL fixtures (ordered by datetime) to build team schedule maps
      const { data: fixtures, error: fixErr } = await supabase
        .from('fantasy_tour_fixtures')
        .select('tour_gameday_id, home_team_short_name, away_team_short_name, match_datetime')
        .order('match_datetime', { ascending: true });

      if (fixErr) throw new Error(fixErr.message);

      // 2. Fetch all gameday point rows for these players
      const { data: gamedayData, error: gdErr } = await supabase
        .from('fantasy_gameday_players')
        .select('player_id, gameday_id, gameday_points')
        .in('player_id', playerIds);

      if (gdErr) throw new Error(gdErr.message);

      // Build a set of gameday_ids that actually have data (a match has been played & synced)
      const playedGamedaySet = new Set<number>(
        (gamedayData || []).map((r: GamedayPointEntry) => r.gameday_id)
      );

      // 3. Build full team schedule (all fixtures for team, in order)
      const scheduleMap: TeamScheduleMap = {};
      // Build played-only team schedule
      const playedScheduleMap: TeamScheduleMap = {};

      for (const team of teamShortNames) {
        const teamFixtures = (fixtures || []).filter(
          f => f.home_team_short_name === team || f.away_team_short_name === team
        );
        // All matches for team (full schedule)
        scheduleMap[team] = teamFixtures.map(f => f.tour_gameday_id);
        // Only played matches (where data exists in gameday_players)
        playedScheduleMap[team] = teamFixtures
          .filter(f => playedGamedaySet.has(f.tour_gameday_id))
          .map(f => f.tour_gameday_id);
      }

      setTeamSchedule(scheduleMap);
      setPlayedTeamSchedule(playedScheduleMap);

      // 4. Build player history map: player_id -> { gameday_id -> points }
      const historyMap: PlayerHistoryMap = {};
      for (const row of (gamedayData || []) as GamedayPointEntry[]) {
        if (!historyMap[row.player_id]) historyMap[row.player_id] = {};
        historyMap[row.player_id][row.gameday_id] = Number(row.gameday_points);
      }
      setPlayerHistory(historyMap);

      // 5. Compute the union of all played gameday_ids across all squad teams
      const unionPlayedIds = new Set<number>();
      for (const team of teamShortNames) {
        for (const gdId of (playedScheduleMap[team] || [])) {
          unionPlayedIds.add(gdId);
        }
      }
      const sortedPlayedIds = Array.from(unionPlayedIds).sort((a, b) => a - b);
      setAllGamedayIds(sortedPlayedIds);

      // 6. Max match count = max number of played games by any single team in squad
      let max = 0;
      for (const team of teamShortNames) {
        const count = (playedScheduleMap[team] || []).length;
        if (count > max) max = count;
      }
      setMaxMatchCount(max);

    } catch (err: unknown) {
      console.error('Failed to fetch player match history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch match history');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIdsKey, teamNamesKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { playerHistory, teamSchedule, playedTeamSchedule, allGamedayIds, maxMatchCount, loading, error };
}

/**
 * Given a player, team schedule, and player history, return a relative
 * match points array indexed from 0 (M1 = index 0).
 * - playedTeamSchedule[team][0] = gamedayId for that team's M1
 * - returns the points for each played match, or 0 if no data for that gameday
 */
export function getRelativeMatchPoints(
  player: { player_id: number; team_short_name: string },
  playedTeamSchedule: TeamScheduleMap,
  playerHistory: PlayerHistoryMap
): number[] {
  const teamGds = playedTeamSchedule[player.team_short_name] || [];
  return teamGds.map(gdId => {
    const pts = playerHistory[player.player_id]?.[gdId];
    return pts !== undefined ? Number(pts) : 0;
  });
}
