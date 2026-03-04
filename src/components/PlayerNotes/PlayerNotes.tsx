import { useState, type FormEvent } from 'react';
import type { PlayerNote, User } from '../../types';
import { api } from '../../api/client';
import styles from './PlayerNotes.module.css';

interface Props {
  notes: PlayerNote[];
  campaignId: number;
  mapId: number;
  hexId: number;
  currentUser: User | null;
  isGM: boolean;
  onNoteChanged: () => void;
}

export function PlayerNotes({
  notes,
  campaignId,
  mapId,
  hexId,
  currentUser,
  isGM,
  onNoteChanged,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const myNote = currentUser
    ? notes.find((n) => n.author_name === currentUser.name)
    : null;

  function startEdit() {
    setBody(myNote?.body || '');
    setEditing(true);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (myNote) {
        await api.updateNote(campaignId, mapId, hexId, myNote.id, body);
      } else {
        await api.createNote(campaignId, mapId, hexId, body);
      }
      setEditing(false);
      onNoteChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h4 className={styles.heading}>Player Notes</h4>

      {notes.length === 0 && !editing && (
        <p className={styles.empty}>No notes yet.</p>
      )}

      {notes.map((note) => (
        <div key={note.id} className={styles.note}>
          <div className={styles.noteHeader}>
            <span className={styles.author}>{note.author_name}</span>
            <span className={styles.time}>
              {new Date(note.updated_at).toLocaleDateString()}
            </span>
          </div>
          <p className={styles.noteBody}>{note.body}</p>
        </div>
      ))}

      {!isGM && currentUser && !editing && (
        <button className={styles.addBtn} onClick={startEdit}>
          {myNote ? 'Edit My Note' : 'Add Note'}
        </button>
      )}

      {editing && (
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your note..."
            rows={3}
            required
            autoFocus
          />
          <div className={styles.formActions}>
            <button className={styles.submitBtn} type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
            <button
              className={styles.cancelBtn}
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
