export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  invite_code: string | null;
  creator_id: string | null;
  settings: Record<string, unknown>;
  participant_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  room_id: string;
  profile_id: string;
  name: string;
  selected_players: number[];
  show_in_lobby?: boolean;
  created_at: string;
  updated_at: string;
}

export interface GamedayPlayer {
  player_id: number;
  gameday_id: number;
  name: string;
  short_name: string;
  team_id: number;
  team_name: string;
  team_short_name: string;
  skill_name: string;
  skill_id: number;
  overall_points: number;
  gameday_points: number;
  last_updated_at: string;
  /** 'P' = player was announced/played in their team's last match, 'NP' = not played */
  is_announced?: string;
}

export interface TourFixture {
  match_id: number;
  tour_gameday_id: number;
  match_date: string;
  match_datetime: string;
  home_team_id: number;
  home_team_name: string;
  home_team_short_name: string;
  away_team_id: number;
  away_team_name: string;
  away_team_short_name: string;
  match_name: string;
  matchday_name: string;
  venue: string;
  status?: string;
  match_number?: number;
  is_live?: boolean;
  match_status?: string | null;
}

// Keeping the legacy interface names so components don't completely break before refactoring,
// but aliasing them to the new Supabase types where applicable.
export type Player = GamedayPlayer;

export interface RoomParticipant {
  id: string;
  room_id: string;
  profile_id: string;
  team_id: string;
  ipl_team: string;
  created_at: string;
  updated_at?: string;
  locked_squad?: number[] | null;
  
  // Realtime Joined fields
  name?: string;
  selected_players?: number[];
  profiles?: {
     display_name: string | null;
     avatar_url: string | null;
  };
}

// ─── Daily Contest ────────────────────────────────────────────────────────────

export type ContestType = 'simple' | 'daily';

export interface ContestConstraints {
  /** Captain (2×) / Vice-Captain (1.5×) multipliers enabled */
  captain_vc?: boolean;
  min_batsmen?: number;
  min_bowlers?: number;
  min_all_rounders?: number;
  min_wicket_keepers?: number;
  /** Minimum players from each match team side (home / away) */
  min_per_team?: number;
}

export interface DailyContestTeam {
  id: string;
  room_id: string;
  profile_id: string;
  /** References fantasy_tour_fixtures.match_id */
  match_id: number;
  selected_players: number[];
  /** null = disabled; player_id when C/VC mode is on */
  captain_id: number | null;
  vice_captain_id: number | null;
  created_at: string;
  updated_at: string;
  // Joined field from useDailyContestTeams
  profiles?: { display_name: string | null; avatar_url: string | null };
}
