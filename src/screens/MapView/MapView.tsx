import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCampaign } from '../../contexts/CampaignContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { HexGrid } from '../../components/HexGrid/HexGrid';
import { HexDetailPanel } from '../../components/HexDetailPanel/HexDetailPanel';
import type { Hex, HexMap } from '../../types';
import styles from './MapView.module.css';

const POLL_INTERVAL = 5 * 60 * 1000;

export function MapView() {
  const { campaignId, mapId } = useParams<{ campaignId: string; mapId: string }>();
  const { campaign, terrainTypes, isGM } = useCampaign();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [map, setMap] = useState<HexMap | null>(null);
  const [hexes, setHexes] = useState<Hex[]>([]);
  const [selectedHex, setSelectedHex] = useState<Hex | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [mapName, setMapName] = useState('');
  const [published, setPublished] = useState(false);
  const pollRef = useRef<number>(0);

  const cId = Number(campaignId);
  const mId = Number(mapId);

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
      // handle offline / errors silently
    } finally {
      setLoading(false);
    }
  }, [cId, mId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
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
    setSelectedHex(hex);
  }

  function handleHexUpdated(updated: Hex) {
    setHexes((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    setSelectedHex(updated);
  }

  function isHexEmpty(hex: Hex): boolean {
    return (
      hex.status === 'unrevealed' &&
      !hex.terrain_type &&
      !hex.name &&
      !hex.description
    );
  }

  function extractHexData(hex: Hex) {
    return {
      active: hex.active ?? false,
      status: hex.status,
      terrain_type_id: hex.terrain_type?.id ?? null,
      name: hex.name ?? '',
      description: hex.description ?? '',
    };
  }

  async function handleHexMove(sourceId: number, targetId: number) {
    const source = hexes.find((h) => h.id === sourceId);
    const target = hexes.find((h) => h.id === targetId);
    if (!source || !target || sourceId === targetId) return;

    const sourceData = extractHexData(source);
    const targetData = extractHexData(target);
    const emptyData = {
      active: false,
      status: 'unrevealed' as const,
      terrain_type_id: null,
      name: '',
      description: '',
    };

    setMoving(true);
    setMoveError('');
    try {
      if (isHexEmpty(target)) {
        await api.updateHex(cId, mId, targetId, sourceData);
        await api.updateHex(cId, mId, sourceId, emptyData);
      } else {
        await api.updateHex(cId, mId, targetId, sourceData);
        await api.updateHex(cId, mId, sourceId, targetData);
      }
    } catch (err) {
      setMoveError((err as Error).message || 'Move failed');
    } finally {
      setMoving(false);
    }

    await fetchData();
  }

  async function handleMapSave() {
    try {
      const updated = await api.updateMap(cId, mId, { name: mapName, published });
      setMap(updated);
      setShowSettings(false);
    } catch {
      // error
    }
  }

  async function handleDeleteMap() {
    if (!confirm('Delete this map? This cannot be undone.')) return;
    try {
      await api.deleteMap(cId, mId);
      navigate(`/campaigns/${cId}/maps`);
    } catch {
      // error
    }
  }

  if (loading || !map || !campaign) {
    return <div className={styles.loading}>Loading map...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.toolbar}>
        <button
          className={styles.backBtn}
          onClick={() => navigate(`/campaigns/${cId}/maps`)}
        >
          &larr;
        </button>
        <h2 className={styles.mapName}>{map.name}</h2>
        <div className={styles.toolbarActions}>
          <button className={styles.iconBtn} onClick={fetchData} title="Refresh">
            &#x21bb;
          </button>
          {isGM && (
            <button
              className={styles.iconBtn}
              onClick={() => setShowSettings(!showSettings)}
              title="Map Settings"
            >
              &#x2699;
            </button>
          )}
        </div>
      </header>

      {showSettings && isGM && (
        <div className={styles.settingsPanel}>
          <label className={styles.label}>
            Map Name
            <input
              className={styles.input}
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
            />
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Published (visible to players)
          </label>
          <div className={styles.settingsActions}>
            <button className={styles.saveBtn} onClick={handleMapSave}>
              Save
            </button>
            <button className={styles.deleteBtn} onClick={handleDeleteMap}>
              Delete Map
            </button>
          </div>
        </div>
      )}

      <div className={styles.gridContainer}>
        <HexGrid
          hexes={hexes}
          cols={map.grid_cols}
          rows={map.grid_rows}
          isGM={isGM}
          onHexClick={handleHexClick}
          onHexMove={isGM ? handleHexMove : undefined}
        />
        {moving && (
          <div className={styles.movingOverlay}>Moving…</div>
        )}
        {moveError && (
          <div className={styles.moveError} onClick={() => setMoveError('')}>
            {moveError} &times;
          </div>
        )}
      </div>

      {selectedHex && (
        <HexDetailPanel
          hex={selectedHex}
          campaignId={cId}
          mapId={mId}
          terrainTypes={terrainTypes}
          isGM={isGM}
          currentUser={user}
          onClose={() => setSelectedHex(null)}
          onHexUpdated={handleHexUpdated}
        />
      )}
    </div>
  );
}
