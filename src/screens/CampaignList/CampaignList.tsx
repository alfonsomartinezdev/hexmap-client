import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Campaign } from '../../types';
import styles from './CampaignList.module.css';

export function CampaignList() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getCampaigns()
      .then(setCampaigns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const c = await api.createCampaign(newName.trim());
      setCampaigns((prev) => [...prev, c]);
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const c = await api.joinCampaign(inviteCode.trim());
      setCampaigns((prev) => [...prev, c]);
      setInviteCode('');
      setShowJoin(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading campaigns...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>Your Campaigns</h2>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
          >
            + Create
          </button>
          <button
            className={`${styles.actionBtn} ${styles.secondary}`}
            onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
          >
            Join
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className={styles.inlineForm}>
          {error && <div className={styles.error}>{error}</div>}
          <input
            className={styles.input}
            placeholder="Campaign name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />
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

      {showJoin && (
        <form onSubmit={handleJoin} className={styles.inlineForm}>
          {error && <div className={styles.error}>{error}</div>}
          <input
            className={styles.input}
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            autoFocus
          />
          <div className={styles.formActions}>
            <button className={styles.submitBtn} type="submit" disabled={submitting}>
              Join
            </button>
            <button
              className={styles.cancelBtn}
              type="button"
              onClick={() => setShowJoin(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className={styles.empty}>
          <p>No campaigns yet.</p>
          <p>Create a new campaign or join one with an invite code.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {campaigns.map((c) => (
            <li
              key={c.id}
              className={styles.item}
              onClick={() => navigate(`/campaigns/${c.id}/maps`)}
            >
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{c.name}</span>
                <span className={`${styles.badge} ${c.role === 'gm' ? styles.badgeGm : styles.badgePlayer}`}>
                  {c.role.toUpperCase()}
                </span>
              </div>
              <span className={styles.arrow}>&rsaquo;</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
