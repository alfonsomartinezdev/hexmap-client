import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCampaign } from '../../contexts/CampaignContext';
import { api } from '../../api/client';
import type { TerrainType } from '../../types';
import styles from './TerrainTypes.module.css';

export function TerrainTypes() {
  const { campaign, terrainTypes, isGM, refreshTerrainTypes } = useCampaign();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#888888');
  const [icon, setIcon] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!campaign || !isGM) return null;

  function startEdit(tt: TerrainType) {
    setEditingId(tt.id);
    setName(tt.name);
    setColor(tt.color);
    setIcon(tt.icon);
    setShowAdd(false);
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setName('');
    setColor('#888888');
    setIcon('');
    setError('');
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.createTerrainType(campaign!.id, { name: name.trim(), color, icon });
      await refreshTerrainTypes();
      setName('');
      setColor('#888888');
      setIcon('');
      setShowAdd(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError('');
    setSubmitting(true);
    try {
      await api.updateTerrainType(campaign!.id, editingId, { name: name.trim(), color, icon });
      await refreshTerrainTypes();
      cancelEdit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this terrain type? Hexes using it will lose their terrain.')) return;
    try {
      await api.deleteTerrainType(campaign!.id, id);
      await refreshTerrainTypes();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>
        <Link to="/campaigns" className={styles.breadcrumbLink}>Campaigns</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <Link to={`/campaigns/${campaign.id}/maps`} className={styles.breadcrumbLink}>
          {campaign.name}
        </Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span>Terrain Types</span>
      </div>

      <div className={styles.titleRow}>
        <h2 className={styles.title}>Terrain Types</h2>
        <button
          className={styles.addBtn}
          onClick={() => { setShowAdd(true); cancelEdit(); }}
        >
          + Add Custom
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <input
            className={styles.input}
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className={styles.row}>
            <label className={styles.colorLabel}>
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <input
              className={styles.input}
              placeholder="Icon (emoji)"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              required
              style={{ flex: 1 }}
            />
          </div>
          <div className={styles.formActions}>
            <button className={styles.submitBtn} type="submit" disabled={submitting}>Add</button>
            <button className={styles.cancelBtn} type="button" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}

      <ul className={styles.list}>
        {terrainTypes.map((tt) => (
          <li key={tt.id} className={styles.item}>
            {editingId === tt.id ? (
              <form onSubmit={handleUpdate} className={styles.editForm}>
                {error && <div className={styles.error}>{error}</div>}
                <input
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
                <div className={styles.row}>
                  <label className={styles.colorLabel}>
                    Color
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  </label>
                  <input
                    className={styles.input}
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                </div>
                <div className={styles.formActions}>
                  <button className={styles.submitBtn} type="submit" disabled={submitting}>Save</button>
                  <button className={styles.cancelBtn} type="button" onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className={styles.itemRow}>
                <div className={styles.swatch} style={{ background: tt.color }}>
                  <span>{tt.icon}</span>
                </div>
                <span className={styles.itemName}>{tt.name}</span>
                {tt.built_in && <span className={styles.builtIn}>Built-in</span>}
                <div className={styles.itemActions}>
                  <button className={styles.editBtn} onClick={() => startEdit(tt)}>Edit</button>
                  {!tt.built_in && (
                    <button className={styles.deleteBtn} onClick={() => handleDelete(tt.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
