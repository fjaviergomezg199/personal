import { useSyncExternalStore } from 'react';
import type { EntryKind, GoogleEvent, HHMM, ID, ISODate } from '../store/types';

/** Hojas globales que se pueden abrir desde cualquier pantalla. */
export type SheetRequest =
  | { type: 'quick'; date?: ISODate; time?: HHMM; categoryId?: ID; kind?: EntryKind | 'birthday'; text?: string; dictation?: number }
  | { type: 'entry'; id: ID; date?: ISODate }
  | { type: 'move'; id: ID }
  | { type: 'birthday'; id?: ID }
  | { type: 'google'; event: GoogleEvent }
  | { type: 'import'; text?: string };

let current: SheetRequest | null = null;
const listeners = new Set<() => void>();

export function openSheet(req: SheetRequest) {
  current = req;
  listeners.forEach((l) => l());
}

export function closeSheet() {
  current = null;
  listeners.forEach((l) => l());
}

export function useCurrentSheet(): SheetRequest | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
