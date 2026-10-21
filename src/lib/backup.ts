import { files } from '../store/db';
import { getState, normalizeState, replaceState, updateSettings } from '../store/store';
import type { AppState } from '../store/types';
import { blobToDataUrl, dataUrlToBlob, saveFile } from './files';
import { todayISO } from './dates';

interface BackupFile {
  app: 'diaadia';
  version: 1;
  exportedAt: string;
  state: AppState;
  files: { id: string; dataUrl: string }[];
}

export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const s = getState();
  const out: BackupFile = {
    app: 'diaadia',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: { ...s, googleEvents: [], notified: {} },
    files: [],
  };
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

export async function importBackup(file: File): Promise<{ docs: number; entries: number; areas: number }> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('El fichero no es una copia de seguridad válida.');
  }
  if (data?.app !== 'diaadia' || !data.state) throw new Error('El fichero no es una copia de Día a Día.');
  for (const f of data.files ?? []) {
    try {
      await files.put(f.id, await dataUrlToBlob(f.dataUrl));
    } catch {
      /* fichero dañado: se omite */
    }
  }
  const current = getState();
  const next = normalizeState(data.state);
  // Conservamos la conexión con Google de este dispositivo.
  next.settings.google = { ...next.settings.google, clientId: next.settings.google.clientId || current.settings.google.clientId };
  next.settings.onboarded = true;
  replaceState(next);
  return { docs: data.files?.length ?? 0, entries: next.entries.length, areas: next.areas.length };
}
