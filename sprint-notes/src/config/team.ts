import type { TeamMember } from '../types';

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'efron',
    name: 'Efron Berlian',
    accountId: '5f049c6ad6803200213ba5a3',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/5f049c6ad6803200213ba5a3/a24e42d9-2afa-4470-97b4-f5ec3d12fdf0/48',
  },
  {
    id: 'erick',
    name: 'Erick Cardiel',
    accountId: '712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c/98243a1e-d9e0-410e-b3ee-92d853310484/48',
  },
  {
    id: 'briano',
    name: 'Briano Wong',
    accountId: '712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94/4c0b8bbf-8825-44fd-8a09-d409704575d3/48',
  },
  {
    id: 'mitchell',
    name: 'Mitchell Coakley',
    accountId: '712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4/1c91c8de-65a1-4021-9601-27328cf2ac9d/48',
  },
  {
    id: 'wlad',
    name: 'Wladimir',
    accountId: '712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b/9fcff086-8ebd-4959-a2ef-05d8d819f06a/48',
  },
];

// Helper to find team member by JIRA account ID
export function findMemberByAccountId(accountId: string | null): TeamMember | undefined {
  if (!accountId) return undefined;
  return TEAM_MEMBERS.find((m) => m.accountId === accountId);
}

// Helper to find team member by internal ID
export function findMemberById(id: string): TeamMember | undefined {
  return TEAM_MEMBERS.find((m) => m.id === id);
}
