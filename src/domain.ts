import type { ScreenKind, Snapshot } from './types';

export function stockholmDay(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function usedSlots(data: Snapshot, ruleId: string, day = stockholmDay()): number {
  return data.requests.filter(r => r.rule_id === ruleId && r.task_day === day && r.status !== 'rejected').length;
}

export function deduction(minutes: number, kind: ScreenKind): number {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 10000) {
    throw new Error('Ange ett helt antal minuter mellan 1 och 10 000.');
  }
  return minutes * (kind === 'youtube' ? 2 : 1);
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

export const childEmails: Record<string, string> = {
  maximilian: 'maximilian@children.screentime.invalid',
  walter: 'walter@children.screentime.invalid',
};

export function escape(value: string | number): string {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}
