import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router-dom';
import type { Campaign, TerrainType } from '../types';
import { api } from '../api/client';

interface CampaignContextType {
  campaign: Campaign | null;
  terrainTypes: TerrainType[];
  isGM: boolean;
  loading: boolean;
  refreshTerrainTypes: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextType | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [terrainTypes, setTerrainTypes] = useState<TerrainType[]>([]);
  const [loading, setLoading] = useState(true);

  const id = campaignId ? Number(campaignId) : null;

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([api.getCampaign(id), api.getTerrainTypes(id)])
      .then(([c, tt]) => {
        if (cancelled) return;
        setCampaign(c);
        setTerrainTypes(tt);
      })
      .catch(() => {
        if (cancelled) return;
        setCampaign(null);
        setTerrainTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  async function refreshTerrainTypes() {
    if (!id) return;
    const tt = await api.getTerrainTypes(id);
    setTerrainTypes(tt);
  }

  const isGM = campaign?.role === 'gm';

  return (
    <CampaignContext.Provider
      value={{ campaign, terrainTypes, isGM, loading, refreshTerrainTypes }}
    >
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextType {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign must be used within CampaignProvider');
  return ctx;
}
