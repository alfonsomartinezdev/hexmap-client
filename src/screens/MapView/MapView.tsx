import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCampaign } from '../../contexts/CampaignContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { HexGrid } from '../../components/HexGrid/HexGrid';
import { HexDetailPanel } from '../../components/HexDetailPanel/HexDetailPanel';
import type { Hex, HexMap, HexOverride, TerrainType } from '../../types';
import styles from './MapView.module.css';

const POLL_INTERVAL = 5 * 60 * 1000;

const EMPTY_OVERRIDE: HexOverride = {
  active: false,
  status: 'unrevealed',
  terrain_type_id: null,
  terrain_type: null,
  name: '',
  description: '',
};

export function MapView() {
  const { campaignId, mapId } = useParams<{ campaignId: string; mapId: string }>();
  const { campaign, terrainTypes, isGM } = useCampaign();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [map, setMap] = useState<HexMap | null>(null);
  const [hexes, setHexes] = useState<Hex[]>([]);
  const [selectedHex, setSelectedHex] = useState<Hex | null>(null);
  const [loading, setLoading] = useState(true);

  // Local editing state — GM only
  const [pendingChanges, setPendingChanges] = useState<Map<number, Partial<HexOverride>>>(new Map());
  const pendingRef = useRef<Map<number, Partial<HexOverride>>>(new Map());
  const [paintTerrain, setPaintTerrain] = useState<TerrainType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);

  // Map settings
  const [showSettings, setShowSettings] = useState(false);
  const [mapName, setMapName] = useState('');
  const [published, setPublished] = useState(false);
  const pollRef = useRef<number>(0);

  const cId = Number(campaignId);
  const mId = Number(mapId);

  // Server hexes merged with local overrides — this is what renders
  const displayHexes = useMemo(
    () => hexes.map(h => {
      const override = pendingChanges.get(h.id);
      return override ? { ...h, ...override } : h;
    }),
    [hexes, pendingChanges]
  );

  function updatePending(next: Map<number, Partial<HexOverride>>) {
    pendingRef.current = next;
    setPendingChanges(next);
  }

  function applyLocalHexUpdate(hexId: number, fields: Partial<HexOverride>) {
    const next = new Map(pendingRef.current);
    next.set(hexId, { ...(next.get(hexId) ?? {}), ...fields });
    updatePending(next);
  }

  const fetchData = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([
        api.getMap(cId, mId),
        api.getHexes(cId, mId),
      ]);
      setMap(m);
      setHexes(h);
      setMapName(m.name);
      setPublished(m.published);
    } catch {
      // silent — offline or error
    } finally {
      setLoading(false);
    }
  }, [cId, mId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') fetchData();
    }
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, POLL_INTERVAL);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

  function handleHexClick(hex: Hex) {
    if (paintTerrain && isGM) {
      applyLocalHexUpdate(hex.id, {
        terrain_type_id: paintTerrain.id,
        terrain_type: paintTerrain,
        active: true,
      });
      return;
    }
    setSelectedHex(hex);
  }

  // Still used after note saves (server-driven update)
  function handleHexUpdated(updated: Hex) {
    setHexes(prev => prev.map(h => h.id === updated.id ? updated : h));
    const override = pendingRef.current.get(updated.id);
    setSelectedHex(override ? { ...updated, ...override } : updated);
  }

  function isHexEmpty(hex: Hex): boolean {
    return (
      !(hex.active ?? false) &&
      hex.status === 'unrevealed' &&
      !hex.terrain_type &&
      !hex.name &&
      !hex.description
    );
  }

  function extractHexOverride(hex: Hex): HexOverride {
    return {
      active: hex.active ?? false,
      status: hex.status,
      terrain_type_id: hex.terrain_type?.id ?? null,
      terrain_type: hex.terrain_type ?? null,
      name: hex.name ?? '',
      description: hex.description ?? '',
    };
  }

  // Instant local move/swap — no API calls
  function handleHexMove(sourceId: number, targetId: number) {
    const source = displayHexes.find(h => h.id === sourceId);
    const target = displayHexes.find(h => h.id === targetId);
    if (!source || !target || sourceId === targetId) return;

    const sourceOverride = extractHexOverride(source);
    const targetOverride = extractHexOverride(target);

    if (isHexEmpty(target)) {
      applyLocalHexUpdate(targetId, sourceOverride);
      applyLocalHexUpdate(sourceId, EMPTY_OVERRIDE);
    } else {
      applyLocalHexUpdate(targetId, sourceOverride);
      applyLocalHexUpdate(sourceId, targetOverride);
    }
  }

  // Called by HexDetailPanel instead of saving to API
  function handleApplyLocal(hexId: number, fields: HexOverride) {
    applyLocalHexUpdate(hexId, fields);
  }

  async function handleSaveAll() {
    if (pendingRef.current.size === 0) return;
    setSaving(true);
    setSaveError('');
    const entries = Array.from(pendingRef.current.entries());
    setSaveProgress({ done: 0, total: entries.length });
    try {
      for (let i = 0; i < entries.length; i++) {
        const [hexId, override] = entries[i];
        const serverHex = hexes.find(h => h.id === hexId);
        if (!serverHex) continue;
        const base = extractHexOverride(serverHex);
        const merged = { ...base, ...override };
        await api.updateHex(cId, mId, hexId, {
          active: merged.active,
          status: merged.status,
          terrain_type_id: merged.terrain_type_id,
          name: merged.name,
          description: merged.description,
        });
        setSaveProgress({ done: i + 1, total: entries.length });
      }
      updatePending(new Map());
      await fetchData();
    } catch (err) {
      setSaveError((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
      setSaveProgress(null);
    }
  }

  async function handleMapSave() {
    try {
      const updated = await api.updateMap(cId, mId, { name: mapName, published });
      setMap(updated);
      setShowSettings(false);
    } catch { /* */ }
  }

  async function handleDeleteMap() {
    if (!confirm('Delete this map? This cannot be undone.')) return;
    try {
      await api.deleteMap(cId, mId);
      navigate(`/campaigns/${cId}/maps`);
    } catch { /* */ }
  }

  if (loading || !map || !campaign) {
    return <div className={styles.loading}>Loading map…</div>;
  }

  const pendingCount = pendingChanges.size;

  return (
    <div className={styles.container}>
      <header className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate(`/campaigns/${cId}/maps`)}>
          &larr;
        </button>
        <h2 className={styles.mapName}>{map.name}</h2>
        <div className={styles.toolbarActions}>
          {isGM && pendingCount > 0 && (
            <button
              className={styles.saveAllBtn}
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving
                ? saveProgress ? `${saveProgress.done}/${saveProgress.total}` : '…'
                : `Save ${pendingCount}`}
            </button>
          )}
          <button className={styles.iconBtn} onClick={fetchData} title="Refresh">
            &#x21bb;
          </button>
          {isGM && (
            <>
              <button
                className={`${styles.iconBtn} ${paintTerrain ? styles.iconBtnActive : ''}`}
                onClick={() => setPaintTerrain(t => t ? null : (terrainTypes[0] ?? null))}
                title={paintTerrain ? 'Exit paint mode' : 'Paint terrain'}
              >
                🖌
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => setShowSettings(s => !s)}
                title="Map Settings"
              >
                &#x2699;
              </button>
            </>
          )}
        </div>
      </header>

      {showSettings && isGM && (
        <div className={styles.settingsPanel}>
          <label className={styles.label}>
            Map Name
            <input className={styles.input} value={mapName} onChange={e => setMapName(e.target.value)} />
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />
            Published (visible to players)
          </label>
          <div className={styles.settingsActions}>
            <button className={styles.saveBtn} onClick={handleMapSave}>Save</button>
            <button className={styles.deleteBtn} onClick={handleDeleteMap}>Delete Map</button>
          </div>
        </div>
      )}

      <div className={styles.gridContainer}>
        <HexGrid
          hexes={displayHexes}
          cols={map.grid_cols}
          rows={map.grid_rows}
          isGM={isGM}
          onHexClick={handleHexClick}
          onHexMove={isGM ? handleHexMove : undefined}
          onHexPaint={isGM && paintTerrain ? (hex) => applyLocalHexUpdate(hex.id, {
            terrain_type_id: paintTerrain.id,
            terrain_type: paintTerrain,
            active: true,
          }) : undefined}
          pendingHexIds={pendingCount > 0 ? new Set(pendingChanges.keys()) : undefined}
        />

        {/* Terrain paint palette */}
        {isGM && paintTerrain && (
          <div className={styles.paintPalette}>
            {terrainTypes.map(tt => (
              <button
                key={tt.id}
                className={`${styles.paletteBtn} ${paintTerrain.id === tt.id ? styles.paletteBtnActive : ''}`}
                style={{ background: tt.color } as React.CSSProperties}
                onClick={() => setPaintTerrain(tt)}
                title={tt.name}
              >
                {tt.icon}
              </button>
            ))}
            <button
              className={styles.paletteDismiss}
              onClick={() => setPaintTerrain(null)}
              title="Exit paint mode"
            >
              ✕
            </button>
          </div>
        )}

        {saveError && (
          <div className={styles.saveErrorToast} onClick={() => setSaveError('')}>
            {saveError} &times;
          </div>
        )}
      </div>

      {selectedHex && !paintTerrain && (
        <HexDetailPanel
          hex={selectedHex}
          campaignId={cId}
          mapId={mId}
          terrainTypes={terrainTypes}
          isGM={isGM}
          currentUser={user}
          onClose={() => setSelectedHex(null)}
          onHexUpdated={handleHexUpdated}
          onApplyLocal={isGM ? (fields) => handleApplyLocal(selectedHex.id, fields) : undefined}
        />
      )}
    </div>
  );
}
