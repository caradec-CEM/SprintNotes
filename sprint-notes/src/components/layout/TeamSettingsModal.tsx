import { useState, useEffect, useMemo } from 'react';
import { useTeamStore, useAllMembers } from '../../stores/teamStore';
import { useSprintStore } from '../../stores/sprintStore';
import { Avatar } from '../common';
import type { TeamMember } from '../../types';
import './TeamSettingsModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DraftMember {
  id: string;
  name: string;
  accountId: string;
  avatarUrl: string;
  role: 'engineer' | 'admin';
}

const EMPTY_DRAFT: DraftMember = { id: '', name: '', accountId: '', avatarUrl: '', role: 'engineer' };

// Derive a short id slug from a full name, e.g. "Burno Sanchez" → "burno"
function suggestId(name: string, existing: TeamMember[]): string {
  const base = name.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (!base) return '';
  if (!existing.some((m) => m.id === base)) return base;
  // Append a counter if collision
  let i = 2;
  while (existing.some((m) => m.id === `${base}${i}`)) i++;
  return `${base}${i}`;
}

export function TeamSettingsModal({ open, onClose }: Props) {
  const members = useAllMembers();
  const addMember = useTeamStore((s) => s.addMember);
  const updateMember = useTeamStore((s) => s.updateMember);
  const setActive = useTeamStore((s) => s.setActive);
  const removeMember = useTeamStore((s) => s.removeMember);
  const currentSprint = useSprintStore((s) => s.currentSprint);
  const inFlightTickets = useSprintStore((s) => s.inFlightTickets);

  const [draft, setDraft] = useState<DraftMember>(EMPTY_DRAFT);
  const [idTouched, setIdTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TeamMember>>({});

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Aggregate unknown participants across current sprint + in-flight tickets.
  // Returns one entry per unique accountId with a hit count.
  const detected = useMemo(() => {
    if (!currentSprint) return [];
    const knownAccountIds = new Set(members.map((m) => m.accountId));
    const counts = new Map<string, { accountId: string; displayName: string; count: number; avatarUrl?: string }>();
    const consider = (tickets: typeof currentSprint.tickets) => {
      for (const t of tickets) {
        if (!t.unknownParticipants) continue;
        for (const p of t.unknownParticipants) {
          if (knownAccountIds.has(p.accountId)) continue;
          const existing = counts.get(p.accountId);
          if (existing) {
            existing.count++;
            if (!existing.avatarUrl && p.avatarUrl) existing.avatarUrl = p.avatarUrl;
          } else {
            counts.set(p.accountId, { accountId: p.accountId, displayName: p.displayName, count: 1, avatarUrl: p.avatarUrl });
          }
        }
      }
    };
    consider(currentSprint.tickets);
    consider(inFlightTickets);
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [currentSprint, inFlightTickets, members]);

  if (!open) return null;

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  const handleDraftNameChange = (name: string) => {
    setDraft((d) => ({
      ...d,
      name,
      id: idTouched ? d.id : suggestId(name, members),
    }));
  };

  const handleSubmitDraft = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    const accountId = draft.accountId.trim();
    if (!id || !name || !accountId) return;
    if (members.some((m) => m.id === id)) return;
    addMember({
      id,
      name,
      accountId,
      avatarUrl: draft.avatarUrl.trim() || undefined,
      active: true,
      role: draft.role,
    });
    setDraft(EMPTY_DRAFT);
    setIdTouched(false);
  };

  const handleAddDetected = (accountId: string, displayName: string, avatarUrl?: string) => {
    const id = suggestId(displayName, members);
    addMember({ id, name: displayName, accountId, avatarUrl, active: true, role: 'engineer' });
  };

  const startEdit = (m: TeamMember) => {
    setEditingId(m.id);
    setEditDraft({ name: m.name, accountId: m.accountId, avatarUrl: m.avatarUrl ?? '' });
  };

  const commitEdit = () => {
    if (!editingId) return;
    updateMember(editingId, {
      name: editDraft.name?.trim() || undefined,
      accountId: editDraft.accountId?.trim() || undefined,
      avatarUrl: (editDraft.avatarUrl as string)?.trim() || undefined,
    });
    setEditingId(null);
    setEditDraft({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  return (
    <div className="team-settings__backdrop" onClick={onClose}>
      <div
        className="team-settings__dialog"
        role="dialog"
        aria-label="Team settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="team-settings__header">
          <h2 className="team-settings__title">Team Settings</h2>
          <button className="team-settings__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="team-settings__body">
          {/* Active members */}
          <section className="team-settings__section">
            <h3 className="team-settings__section-title">
              Active <span className="team-settings__count">({active.length})</span>
            </h3>
            <ul className="team-settings__list">
              {active.map((m) => (
                <li key={m.id} className="team-settings__row">
                  {editingId === m.id ? (
                    <div className="team-settings__edit">
                      <input
                        value={editDraft.name ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        placeholder="Display name"
                        className="team-settings__input"
                      />
                      <input
                        value={editDraft.accountId ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, accountId: e.target.value })}
                        placeholder="JIRA accountId"
                        className="team-settings__input team-settings__input--mono"
                      />
                      <input
                        value={editDraft.avatarUrl ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, avatarUrl: e.target.value })}
                        placeholder="Avatar URL (optional)"
                        className="team-settings__input"
                      />
                      <div className="team-settings__edit-actions">
                        <button onClick={commitEdit} className="team-settings__btn team-settings__btn--primary">Save</button>
                        <button onClick={cancelEdit} className="team-settings__btn">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Avatar name={m.name} src={m.avatarUrl} className="team-settings__avatar" />
                      <div className="team-settings__row-info">
                        <div className="team-settings__row-name">{m.name}</div>
                        <div className="team-settings__row-meta">id: {m.id} · {m.accountId}</div>
                      </div>
                      <div className="team-settings__role-toggle" role="group" aria-label="Role">
                        <button
                          className={`team-settings__role-opt${m.role !== 'admin' ? ' team-settings__role-opt--on' : ''}`}
                          onClick={() => updateMember(m.id, { role: 'engineer' })}
                        >
                          Engineer
                        </button>
                        <button
                          className={`team-settings__role-opt${m.role === 'admin' ? ' team-settings__role-opt--on' : ''}`}
                          onClick={() => updateMember(m.id, { role: 'admin' })}
                        >
                          Admin
                        </button>
                      </div>
                      <div className="team-settings__row-actions">
                        <button onClick={() => startEdit(m)} className="team-settings__btn">Edit</button>
                        <button onClick={() => setActive(m.id, false)} className="team-settings__btn">Mark left</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {active.length === 0 && (
                <li className="team-settings__empty">No active members.</li>
              )}
            </ul>
          </section>

          {/* Former members */}
          {inactive.length > 0 && (
            <section className="team-settings__section">
              <h3 className="team-settings__section-title">
                Former <span className="team-settings__count">({inactive.length})</span>
              </h3>
              <ul className="team-settings__list">
                {inactive.map((m) => (
                  <li key={m.id} className="team-settings__row team-settings__row--inactive">
                    <Avatar name={m.name} src={m.avatarUrl} className="team-settings__avatar" />
                    <div className="team-settings__row-info">
                      <div className="team-settings__row-name">{m.name}</div>
                      <div className="team-settings__row-meta">id: {m.id}</div>
                    </div>
                    <div className="team-settings__row-actions">
                      <button onClick={() => setActive(m.id, true)} className="team-settings__btn">Reactivate</button>
                      <button onClick={() => removeMember(m.id)} className="team-settings__btn team-settings__btn--danger">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Detect from current sprint */}
          <section className="team-settings__section">
            <h3 className="team-settings__section-title">
              Detected from current sprint <span className="team-settings__count">({detected.length})</span>
            </h3>
            {detected.length === 0 ? (
              <p className="team-settings__empty">
                No unknown participants found in the current sprint's tickets. Anyone listed as developer, reviewer, or assignee whose accountId isn't already in the roster will appear here.
              </p>
            ) : (
              <ul className="team-settings__list">
                {detected.map((d) => (
                  <li key={d.accountId} className="team-settings__row">
                    <Avatar name={d.displayName} src={d.avatarUrl} className="team-settings__avatar" />
                    <div className="team-settings__row-info">
                      <div className="team-settings__row-name">{d.displayName}</div>
                      <div className="team-settings__row-meta">{d.accountId} · {d.count} ticket{d.count !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="team-settings__row-actions">
                      <button
                        onClick={() => handleAddDetected(d.accountId, d.displayName, d.avatarUrl)}
                        className="team-settings__btn team-settings__btn--primary"
                      >
                        Add to team
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Manual add */}
          <section className="team-settings__section">
            <h3 className="team-settings__section-title">Add member manually</h3>
            <div className="team-settings__add-form">
              <input
                value={draft.name}
                onChange={(e) => handleDraftNameChange(e.target.value)}
                placeholder="Display name (e.g. Burno Sanchez)"
                className="team-settings__input"
              />
              <input
                value={draft.id}
                onChange={(e) => { setDraft({ ...draft, id: e.target.value }); setIdTouched(true); }}
                placeholder="Short id (e.g. burno)"
                className="team-settings__input"
              />
              <input
                value={draft.accountId}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
                placeholder="JIRA accountId"
                className="team-settings__input team-settings__input--mono"
              />
              <input
                value={draft.avatarUrl}
                onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })}
                placeholder="Avatar URL (optional)"
                className="team-settings__input"
              />
              <div className="team-settings__role-toggle" role="group" aria-label="Role">
                <button
                  className={`team-settings__role-opt${draft.role === 'engineer' ? ' team-settings__role-opt--on' : ''}`}
                  onClick={() => setDraft({ ...draft, role: 'engineer' })}
                >
                  Engineer
                </button>
                <button
                  className={`team-settings__role-opt${draft.role === 'admin' ? ' team-settings__role-opt--on' : ''}`}
                  onClick={() => setDraft({ ...draft, role: 'admin' })}
                >
                  Admin
                </button>
              </div>
              <button
                onClick={handleSubmitDraft}
                disabled={!draft.name.trim() || !draft.id.trim() || !draft.accountId.trim()}
                className="team-settings__btn team-settings__btn--primary"
              >
                Add member
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
