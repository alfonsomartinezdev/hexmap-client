import { useState, useEffect, type FormEvent } from 'react';
import type { Hex, HexOverride, TerrainType, User } from '../../types';
import { api } from '../../api/client';
import { PlayerNotes } from '../PlayerNotes/PlayerNotes';
import styles from './HexDetailPanel.module.css';

interface Props {
  hex: Hex;
  campaignId: number;
  mapId: number;
  terrainTypes: TerrainType[];
  isGM: boolean;
  currentUser: User | null;
  onClose: () => void;
  onHexUpdated: (hex: Hex) => void;
  /** GM only: apply changes locally (no immediate API call) */
  onApplyLocal?: (fields: HexOverride) => void;
}

export function HexDetailPanel({
  hex,
  campaignId,
  mapId,
  terrainTypes,
  isGM,
  currentUser,
  onClose,
  onHexUpdated,
  onApplyLocal,
}: Props) {
  const [active, setActive] = useState(hex.active ?? false);
  const [status, setStatus] = useState(hex.status);
  const [terrainTypeId, setTerrainTypeId] = useState<number | ''>(
    hex.terrain_type?.id ?? ''
  );
  const [name, setName] = useState(hex.name ?? '');
  const [description, setDescription] = useState(hex.description ?? '');

  useEffect(() => {
    setActive(hex.active ?? false);
    setStatus(hex.status);
    setTerrainTypeId(hex.terrain_type?.id ?? '');
    setName(hex.name ?? '');
    setDescription(hex.description ?? '');
  }, [hex]);

  function handleClear() {
    if (!confirm('Clear this hex? All data will be reset to defaults.')) return;
    onApplyLocal?.({
      active: false,
      status: 'unrevealed',
      terrain_type_id: null,
      terrain_type: null,
      name: '',
      description: '',
    });
    onClose();
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const selectedTerrain = terrainTypeId === ''
      ? null
      : terrainTypes.find(t => t.id === Number(terrainTypeId)) ?? null;
    onApplyLocal?.({
      active,
      status,
      terrain_type_id: terrainTypeId === '' ? null : Number(terrainTypeId),
      terrain_type: selectedTerrain,
      name: name || '',
      description: description || '',
    });
    onClose();
  }

  function handleNoteChanged() {
    api.getHexes(campaignId, mapId).then((hexes) => {
      const updated = hexes.find((h) => h.id === hex.id);
      if (updated) onHexUpdated(updated);
    });
  }

  const showTerrain = isGM || hex.status === 'revealed' || hex.status === 'explored';
  const showDetails = isGM || hex.status === 'explored';
  const showNotes = isGM || hex.status === 'revealed' || hex.status === 'explored';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />

        <div className={styles.header}>
          <h3 className={styles.title}>
            Hex ({hex.q}, {hex.r})
            {hex.name && showDetails && (
              <span className={styles.hexName}> &mdash; {hex.name}</span>
            )}
          </h3>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.statusBadge} data-status={hex.status}>
          {hex.status}
        </div>

        {isGM ? (
          <form onSubmit={handleSave} className={styles.form}>
            <div>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Include in Map
              </label>
              <p className={styles.hint}>Players can only see hexes included in the map</p>
            </div>

            <label className={styles.label}>
              Status
              <select
                className={styles.select}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Hex['status'])
                }
              >
                <option value="unrevealed">Unrevealed</option>
                <option value="revealed">Revealed</option>
                <option value="explored">Explored</option>
              </select>
            </label>

            <label className={styles.label}>
              Terrain
              <select
                className={styles.select}
                value={terrainTypeId}
                onChange={(e) =>
                  setTerrainTypeId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">None</option>
                {terrainTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.icon} {tt.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hex name"
              />
            </label>

            <label className={styles.label}>
              Description
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hex description"
                rows={3}
              />
            </label>

            <div className={styles.formActions}>
              <button className={styles.saveBtn} type="submit">
                Apply Changes
              </button>
              <button
                className={styles.clearBtn}
                type="button"
                onClick={handleClear}
              >
                Clear Hex
              </button>
            </div>

            {hex.player_notes && hex.player_notes.length > 0 && (
              <div className={styles.notesSection}>
                <PlayerNotes
                  notes={hex.player_notes}
                  campaignId={campaignId}
                  mapId={mapId}
                  hexId={hex.id}
                  currentUser={currentUser}
                  isGM={isGM}
                  onNoteChanged={handleNoteChanged}
                />
              </div>
            )}
          </form>
        ) : (
          <div className={styles.playerView}>
            {showTerrain && hex.terrain_type && (
              <div className={styles.terrainInfo}>
                <div
                  className={styles.terrainSwatch}
                  style={{ background: hex.terrain_type.color }}
                >
                  {hex.terrain_type.icon}
                </div>
                <span>{hex.terrain_type.name}</span>
              </div>
            )}

            {showDetails && hex.description && (
              <p className={styles.description}>{hex.description}</p>
            )}

            {showNotes && hex.player_notes && (
              <PlayerNotes
                notes={hex.player_notes}
                campaignId={campaignId}
                mapId={mapId}
                hexId={hex.id}
                currentUser={currentUser}
                isGM={isGM}
                onNoteChanged={handleNoteChanged}
              />
            )}

            {hex.status === 'unrevealed' && (
              <p className={styles.unrevealed}>This area has not been explored yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
