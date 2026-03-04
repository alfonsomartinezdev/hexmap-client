import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCampaign } from '../../contexts/CampaignContext';
import { api } from '../../api/client';
import type { HexMap } from '../../types';
import styles from './MapList.module.css';

export function MapList() {
  const { campaign, isGM } = useCampaign();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<HexMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [cols, setCols] = useState(10);
  const [rows, setRows] = useState(10);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    api.getMaps(campaign.id)
      .then(setMaps)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaign]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    setError('');
    setSubmitting(true);
    try {
      const m = await api.createMap(campaign.id, {
        name: name.trim(),
        grid_cols: cols,
        grid_rows: rows,
      });
      setMaps((prev) => [...prev, m]);
      setName('');
      setShowCreate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!campaign) return null;

  if (loading) {
    return <div className={styles.loading}>Loading maps...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>
        <Link to="/campaigns" className={styles.breadcrumbLink}>Campaigns</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span>{campaign.name}</span>
      </div>

      <div className={styles.titleRow}>
        <h2 className={styles.title}>Maps</h2>
        <div className={styles.actions}>
          {isGM && (
            <>
              <button
                className={styles.actionBtn}
                onClick={() => { setShowCreate(true); setError(''); }}
              >
                + New Map
              </button>
              <button
                className={`${styles.actionBtn} ${styles.secondary}`}
                onClick={() => navigate(`/campaigns/${campaign.id}/settings`)}
              >
                Settings
              </button>
              <button
                className={`${styles.actionBtn} ${styles.secondary}`}
                onClick={() => navigate(`/campaigns/${campaign.id}/terrain-types`)}
              >
                Terrain
              </button>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className={styles.inlineForm}>
          {error && <div className={styles.error}>{error}</div>}
          <input
            className={styles.input}
            placeholder="Map name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className={styles.gridInputs}>
            <label className={styles.gridLabel}>
              Columns
              <input
                className={styles.input}
                type="number"
                min={1}
                max={30}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
                required
              />
            </label>
            <label className={styles.gridLabel}>
              Rows
              <input
                className={styles.input}
                type="number"
                min={1}
                max={30}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                required
              />
            </label>
          </div>
          <div className={styles.formActions}>
            <button className={styles.submitBtn} type="submit" disabled={submitting}>
              Create
            </button>
            <button
              className={styles.cancelBtn}
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {maps.length === 0 ? (
        <div className={styles.empty}>
          <p>No maps yet.</p>
          {isGM && <p>Create your first map to get started.</p>}
        </div>
      ) : (
        <ul className={styles.list}>
          {maps.map((m) => (
            <li
              key={m.id}
              className={styles.item}
              onClick={() => navigate(`/campaigns/${campaign.id}/maps/${m.id}`)}
            >
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{m.name}</span>
                <span className={styles.itemMeta}>
                  {m.grid_cols} &times; {m.grid_rows}
                </span>
                {isGM && (
                  <span className={`${styles.badge} ${m.published ? styles.badgePublished : styles.badgeDraft}`}>
                    {m.published ? 'Published' : 'Draft'}
                  </span>
                )}
              </div>
              <span className={styles.arrow}>&rsaquo;</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
