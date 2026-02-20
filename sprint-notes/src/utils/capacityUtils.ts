import type { SprintCapacity, EngineerTimeOff } from '../types';

export const DEFAULT_SPRINT_CAPACITY: SprintCapacity = {
  defaultWorkingDays: 10,
  teamHolidays: 0,
  effectiveSprintDays: 10,
};

export const DEFAULT_TIME_OFF: EngineerTimeOff = { ptoDays: 0, workingDays: 10 };

export function computeEffectiveSprintDays(defaultDays: number, holidays: number): number {
  return Math.max(0, defaultDays - holidays);
}

export function computeEngineerWorkingDays(effectiveSprintDays: number, ptoDays: number): number {
  return Math.max(0, effectiveSprintDays - ptoDays);
}

export function computeTeamCapacityPercent(
  engineers: { workingDays: number }[],
  effectiveSprintDays: number
): number {
  if (effectiveSprintDays <= 0 || engineers.length === 0) return 0;
  const fullCapacity = effectiveSprintDays * engineers.length;
  const actual = engineers.reduce((sum, e) => sum + e.workingDays, 0);
  return Math.round((actual / fullCapacity) * 100);
}

export function computePtsPerDay(totalPts: number, workingDays: number): number | null {
  return workingDays > 0 ? totalPts / workingDays : null;
}

export function computeNormalizedVelocity(rawVelocity: number, capacityPercent: number): number | null {
  return capacityPercent > 0 ? rawVelocity / (capacityPercent / 100) : null;
}
