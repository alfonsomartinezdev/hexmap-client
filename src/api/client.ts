const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();

  if (!res.ok) {
    const message =
      data.errors?.join(', ') || data.error || 'Something went wrong';
    const err = new Error(message) as Error & { status: number; data: typeof data };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

export const api = {
  // Auth
  register: (name: string, password: string) =>
    request<import('../types').AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),

  login: (name: string, password: string) =>
    request<import('../types').AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),

  logout: () =>
    request<void>('/auth/logout', { method: 'DELETE' }),

  // Campaigns
  getCampaigns: () =>
    request<import('../types').Campaign[]>('/campaigns'),

  createCampaign: (name: string) =>
    request<import('../types').Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getCampaign: (id: number) =>
    request<import('../types').Campaign>(`/campaigns/${id}`),

  joinCampaign: (invite_code: string) =>
    request<import('../types').Campaign>('/campaigns/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code }),
    }),

  // Maps
  getMaps: (campaignId: number) =>
    request<import('../types').HexMap[]>(`/campaigns/${campaignId}/maps`),

  createMap: (campaignId: number, data: { name: string; grid_cols: number; grid_rows: number }) =>
    request<import('../types').HexMap>(`/campaigns/${campaignId}/maps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMap: (campaignId: number, mapId: number) =>
    request<import('../types').HexMap>(`/campaigns/${campaignId}/maps/${mapId}`),

  updateMap: (campaignId: number, mapId: number, data: Partial<{ name: string; published: boolean }>) =>
    request<import('../types').HexMap>(`/campaigns/${campaignId}/maps/${mapId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMap: (campaignId: number, mapId: number) =>
    request<void>(`/campaigns/${campaignId}/maps/${mapId}`, {
      method: 'DELETE',
    }),

  // Hexes
  getHexes: (campaignId: number, mapId: number) =>
    request<import('../types').Hex[]>(`/campaigns/${campaignId}/maps/${mapId}/hexes`),

  updateHex: (
    campaignId: number,
    mapId: number,
    hexId: number,
    data: Partial<{
      active: boolean;
      status: string;
      terrain_type_id: number | null;
      name: string;
      description: string;
    }>
  ) =>
    request<import('../types').Hex>(
      `/campaigns/${campaignId}/maps/${mapId}/hexes/${hexId}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  // Player Notes
  createNote: (campaignId: number, mapId: number, hexId: number, body: string) =>
    request<import('../types').PlayerNote>(
      `/campaigns/${campaignId}/maps/${mapId}/hexes/${hexId}/player_notes`,
      { method: 'POST', body: JSON.stringify({ body }) }
    ),

  updateNote: (campaignId: number, mapId: number, hexId: number, noteId: number, body: string) =>
    request<import('../types').PlayerNote>(
      `/campaigns/${campaignId}/maps/${mapId}/hexes/${hexId}/player_notes/${noteId}`,
      { method: 'PATCH', body: JSON.stringify({ body }) }
    ),

  // Terrain Types
  getTerrainTypes: (campaignId: number) =>
    request<import('../types').TerrainType[]>(`/campaigns/${campaignId}/terrain_types`),

  createTerrainType: (campaignId: number, data: { name: string; color: string; icon: string }) =>
    request<import('../types').TerrainType>(`/campaigns/${campaignId}/terrain_types`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTerrainType: (
    campaignId: number,
    id: number,
    data: Partial<{ name: string; color: string; icon: string }>
  ) =>
    request<import('../types').TerrainType>(`/campaigns/${campaignId}/terrain_types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTerrainType: (campaignId: number, id: number) =>
    request<void>(`/campaigns/${campaignId}/terrain_types/${id}`, {
      method: 'DELETE',
    }),
};
