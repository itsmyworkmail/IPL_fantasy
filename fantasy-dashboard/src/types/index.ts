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
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  room_id: string;
  profile_id: string;
  name: string;
  selected_players: number[];
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
  
  // Realtime Joined fields
  name?: string;
  selected_players?: number[];
  profiles?: {
     display_name: string | null;
     avatar_url: string | null;
  };
}
