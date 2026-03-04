export interface User {
  id: number;
  name: string;
}

export interface Campaign {
  id: number;
  name: string;
  role: 'gm' | 'player';
  created_at: string;
  invite_code?: string;
}

export interface HexMap {
  id: number;
  name: string;
  grid_cols: number;
  grid_rows: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TerrainType {
  id: number;
  name: string;
  color: string;
  icon: string;
  built_in: boolean;
  campaign_id: number;
}

export interface PlayerNote {
  id: number;
  body: string;
  author_name: string;
  updated_at: string;
}

export interface Hex {
  id: number;
  q: number;
  r: number;
  active?: boolean;
  status: 'unrevealed' | 'revealed' | 'explored';
  terrain_type?: TerrainType | null;
  name?: string | null;
  description?: string | null;
  player_notes?: PlayerNote[];
}

/** Fields that can be locally overridden before saving to the server */
export interface HexOverride {
  active: boolean;
  status: Hex['status'];
  terrain_type_id: number | null;
  terrain_type: TerrainType | null;
  name: string;
  description: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error?: string;
  errors?: string[];
}
