import { useMemo } from 'react';
import { create } from 'zustand';
import type { TeamMember } from '../types';

const API_PATH = '/api/team';

// Seed data. Used only if the API is unreachable or the file is empty
// (e.g. on first run or in a production build). Live data is in data/team.json.
const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'efron',
    name: 'Efron Berlian',
    accountId: '5f049c6ad6803200213ba5a3',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/5f049c6ad6803200213ba5a3/a24e42d9-2afa-4470-97b4-f5ec3d12fdf0/48',
    active: true,
    role: 'engineer',
  },
  {
    id: 'erick',
    name: 'Erick Cardiel',
    accountId: '712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c/98243a1e-d9e0-410e-b3ee-92d853310484/48',
    active: true,
    role: 'engineer',
  },
  {
    id: 'briano',
    name: 'Briano Wong',
    accountId: '712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94/4c0b8bbf-8825-44fd-8a09-d409704575d3/48',
    active: true,
    role: 'engineer',
  },
  {
    id: 'mitchell',
    name: 'Mitchell Coakley',
    accountId: '712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4/1c91c8de-65a1-4021-9601-27328cf2ac9d/48',
    active: true,
    role: 'engineer',
  },
  {
    id: 'wlad',
    name: 'Wladimir',
    accountId: '712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b/9fcff086-8ebd-4959-a2ef-05d8d819f06a/48',
    active: false,
    role: 'engineer',
  },
];

interface TeamState {
  members: TeamMember[];
  loaded: boolean;

  // Mutations (each persists to /api/team)
  setMembers: (members: TeamMember[]) => void;
  addMember: (member: TeamMember) => void;
  updateMember: (id: string, updates: Partial<Omit<TeamMember, 'id'>>) => void;
  setActive: (id: string, active: boolean) => void;
  removeMember: (id: string) => void;
  // Fill in avatarUrl for any member missing one, matched by accountId against
  // a map harvested from JIRA ticket data. No-op for members that already have one.
  enrichAvatars: (avatarsByAccountId: Record<string, string>) => void;
}

async function persist(members: TeamMember[]): Promise<void> {
  try {
    await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members }),
    });
  } catch {
    // API unreachable (e.g. production build) — silently ignore.
  }
}

export const useTeamStore = create<TeamState>()((set, get) => ({
  members: DEFAULT_TEAM_MEMBERS,
  loaded: false,

  setMembers: (members) => {
    set({ members });
    void persist(members);
  },

  addMember: (member) => {
    const next = [...get().members, member];
    set({ members: next });
    void persist(next);
  },

  updateMember: (id, updates) => {
    const next = get().members.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    );
    set({ members: next });
    void persist(next);
  },

  setActive: (id, active) => {
    const next = get().members.map((m) =>
      m.id === id ? { ...m, active } : m
    );
    set({ members: next });
    void persist(next);
  },

  removeMember: (id) => {
    const next = get().members.filter((m) => m.id !== id);
    set({ members: next });
    void persist(next);
  },

  enrichAvatars: (avatarsByAccountId) => {
    let changed = false;
    const next = get().members.map((m) => {
      if (!m.avatarUrl && avatarsByAccountId[m.accountId]) {
        changed = true;
        return { ...m, avatarUrl: avatarsByAccountId[m.accountId] };
      }
      return m;
    });
    if (changed) {
      set({ members: next });
      void persist(next);
    }
  },
}));

// Fire-and-forget load from /api/team on module init.
void (async () => {
  try {
    const res = await fetch(API_PATH);
    if (!res.ok) {
      useTeamStore.setState({ loaded: true });
      return;
    }
    const data = await res.json();
    if (data && Array.isArray(data.members) && data.members.length > 0) {
      useTeamStore.setState({ members: data.members, loaded: true });
    } else {
      useTeamStore.setState({ loaded: true });
    }
  } catch {
    useTeamStore.setState({ loaded: true });
  }
})();

// ── Reactive hooks for components ───────────────────────────────────────
// IMPORTANT: selectors must return stable refs to avoid infinite re-renders.
// Subscribe to `members` (stable ref) and derive filtered lists via useMemo.
export const useAllMembers = () => useTeamStore((s) => s.members);

export const useActiveMembers = () => {
  const members = useTeamStore((s) => s.members);
  return useMemo(() => members.filter((m) => m.active), [members]);
};

// Engineers only — active members who count toward dev capacity. Admins are
// excluded (role !== 'admin' so members missing a role default to engineer).
export const useEngineerMembers = () => {
  const members = useTeamStore((s) => s.members);
  return useMemo(() => members.filter((m) => m.active && m.role !== 'admin'), [members]);
};

// ── Snapshot accessors for non-reactive code (utilities, store actions) ──
export const getActiveMembers = (): TeamMember[] =>
  useTeamStore.getState().members.filter((m) => m.active);

export const getEngineerMembers = (): TeamMember[] =>
  useTeamStore.getState().members.filter((m) => m.active && m.role !== 'admin');

export const getAllMembers = (): TeamMember[] =>
  useTeamStore.getState().members;
