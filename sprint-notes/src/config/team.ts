import type { TeamMember } from '../types';
import { getAllMembers } from '../stores/teamStore';

// Lookup helpers — search the full member list (including inactive) so historical
// references resolve correctly. For reactive component access to the live roster,
// import useActiveMembers / useAllMembers from stores/teamStore directly.

export function findMemberByAccountId(accountId: string | null): TeamMember | undefined {
  if (!accountId) return undefined;
  return getAllMembers().find((m) => m.accountId === accountId);
}

export function findMemberById(id: string): TeamMember | undefined {
  return getAllMembers().find((m) => m.id === id);
}
