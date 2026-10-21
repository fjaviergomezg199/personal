import { files } from '../store/db';
import { getState, normalizeState, replaceState, updateSettings } from '../store/store';
import type { AppState } from '../store/types';
import { blobToDataUrl, dataUrlToBlob, saveFile } from './files';
import { todayISO } from './dates';

export interface BackupFile {
  app: 'diaadia';
  version: 1;
  exportedAt: string;
  state: AppState;
  /** Archivos de las áreas (en la copia de Drive van aparte, uno a uno). */
  files: { id: string; dataUrl: string }[];
}

/** Los datos de la copia (sin lo que se puede volver a pedir a Google). */
export function backupData(s: AppState = getState()): BackupFile {
  return { app: 'diaadia', version: 1, exportedAt: new Date().toISOString(), state: { ...s, googleEvents: [], notified: {} }, files: [] };
}

export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const s = getState();
  const out = backupData(s);
  for (const d of s.docs) {
    const blob = await files.get(d.id);
    if (blob) out.files.push({ id: d.id, dataUrl: await blobToDataUrl(blob) });
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const name = `dia-a-dia-${(s.settings.name || 'copia').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${todayISO()}.json`;
  const result = await saveFile(blob, name);
  if (result !== 'cancelled') updateSettings({ lastBackup: new Date().toISOString() });
  return result;
}

export function readBackup(text: string): BackupFile {
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('El fichero no es una copia de seguridad válida.');
  }
  if (data?.app !== 'diaadia' || !data.state) throw new Error('El fichero no es una copia de Día a Día.');
  return data;
}

/** Sustituye los datos por los de la copia (la conexión con Google y la copia en Drive de este móvil se conservan). */
export function applyBackup(data: BackupFile): { entries: number; areas: number } {
  const current = getState();
  const next = normalizeState(data.state);
  next.settings.google = { ...next.settings.google, clientId: next.settings.google.clientId || current.settings.google.clientId };
  // Ese día no se sube copia automática: la de hoy en Drive aún tiene lo de antes de recuperar.
  const drive = current.settings.drive ?? next.settings.drive;
  if (drive) next.settings.drive = { ...drive, hash: undefined, skipDay: todayISO() };
  next.settings.onboarded = true;
  replaceState(next);
  return { entries: next.entries.length, areas: next.areas.length };
}

export async function importBackup(file: File): Promise<{ docs: number; entries: number; areas: number }> {
  const data = readBackup(await file.text());
  for (const f of data.files ?? []) {
    try {
      await files.put(f.id, await dataUrlToBlob(f.dataUrl));
    } catch {
      /* fichero dañado: se omite */
    }
  }
  return { ...applyBackup(data), docs: data.files?.length ?? 0 };
}
