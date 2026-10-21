import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEntry, getState, normalizeState, replaceState } from '../store/store';
import type { AppState } from '../store/types';
import { backupToDrive, driveBackupDue, KEEP_COPIES, listDriveCopies, restoreFromDrive } from './driveBackup';
import { DRIVE_SCOPE, GOOGLE_SCOPES } from './google';
import { fakeDrive } from './testing/fakeDrive';

// Los archivos de las áreas, en memoria (en el móvil van en IndexedDB).
const mem = vi.hoisted(() => new Map<string, Blob>());
vi.mock('../store/db', () => ({
  files: {
    get: async (id: string) => mem.get(id),
    put: async (id: string, b: Blob) => void mem.set(id, b),
    del: async (id: string) => void mem.delete(id),
  },
  kv: { get: async () => undefined, set: async () => undefined },
}));

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
};
const grant = (scopes: string[]) => storage.set('diaadia:gtoken', JSON.stringify({ token: 'TOKEN', expiresAt: Date.now() + 3600e3, scopes }));

const now = new Date().toISOString();
function start(extra: Partial<AppState> = {}) {
  replaceState(
    normalizeState({
      settings: { name: 'Leyre', onboarded: true, drive: { on: true }, google: { clientId: 'cid' } },
      docs: [
        { id: 'D1', areaId: 'est', title: 'Plan de estudio', type: 'pdf', fileName: 'plan.pdf', mime: 'application/pdf', createdAt: now },
        { id: 'D2', areaId: 'est', title: 'Web de la academia', type: 'link', url: 'https://academia.example', createdAt: now },
      ],
      ...extra,
    } as unknown as Partial<AppState>),
  );
}
const cita = (title: string) => addEntry({ kind: 'event', title, date: '2026-10-24', time: '21:30', repeat: 'none', alert: null });

let drive: ReturnType<typeof fakeDrive>;
beforeEach(() => {
  storage.clear();
  mem.clear();
  mem.set('D1', new Blob(['%PDF plan'], { type: 'application/pdf' }));
  vi.stubGlobal('localStorage', fakeStorage);
  drive = fakeDrive();
  vi.stubGlobal('fetch', drive.fetchImpl);
  grant([...GOOGLE_SCOPES, DRIVE_SCOPE]);
  start();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('copia en Google Drive', () => {
  it('la primera crea la carpeta, sube los archivos y la copia del día', async () => {
    cita('Cena en el Txoko');
    const r = await backupToDrive();
    expect(r).toEqual({ status: 'ok', copies: 1, uploaded: 1 });
    const [folder] = drive.live('carpeta');
    expect(folder.name).toBe('Día a Día · copias');
    const [sub] = drive.live('archivos');
    expect(sub.parents).toEqual([folder.id]);
    const [file] = drive.live('archivo');
    expect([file.name, file.parents, file.appProperties.doc, await file.content.text()]).toEqual(['plan.pdf', [sub.id], 'D1', '%PDF plan']);
    const [copy] = drive.live('copia');
    expect(copy.parents).toEqual([folder.id]);
    expect(copy.name).toMatch(/^dia-a-dia-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await copy.content.text());
    expect(data.app).toBe('diaadia');
    expect(data.state.entries.map((e: { title: string }) => e.title)).toEqual(['Cena en el Txoko']);
    expect(getState().settings.drive).toMatchObject({ on: true, copies: 1 });
    expect(getState().settings.drive?.last).toBeTruthy();
  });

  it('sin cambios no sube otra; con cambios el mismo día sustituye la de hoy', async () => {
    await backupToDrive();
    expect(await backupToDrive()).toEqual({ status: 'unchanged' });
    expect(driveBackupDue()).toBe(false);
    cita('Cine');
    expect(await backupToDrive()).toEqual({ status: 'ok', copies: 1, uploaded: 0 });
    const copies = drive.live('copia');
    expect(copies).toHaveLength(1);
    expect(JSON.parse(await copies[0].content.text()).state.entries).toHaveLength(1);
    expect(drive.live('archivo')).toHaveLength(1);
  });

  it(`guarda las ${KEEP_COPIES} últimas (las viejas van a la papelera)`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let d = 1; d <= KEEP_COPIES + 2; d++) {
      vi.setSystemTime(new Date(2026, 9, d, 12));
      expect(driveBackupDue()).toBe(true);
      await backupToDrive();
      cita(`Plan ${d}`);
    }
    const days = drive.live('copia').map((f) => f.appProperties.day).sort();
    expect(days).toHaveLength(KEEP_COPIES);
    expect(days[0]).toBe('2026-10-03');
    expect(getState().settings.drive?.copies).toBe(KEEP_COPIES);
  });

  it('en un móvil nuevo recupera la copia y sus archivos', async () => {
    cita('Cena en el Txoko');
    await backupToDrive();
    const areas = getState().areas.map((a) => a.name);
    // Móvil nuevo: sin datos ni archivos
    mem.clear();
    replaceState(normalizeState({ settings: { name: '', onboarded: false, google: { clientId: 'cid' } } } as unknown as Partial<AppState>));
    const copies = await listDriveCopies();
    expect(copies).toHaveLength(1);
    const r = await restoreFromDrive(copies[0]);
    expect(r).toMatchObject({ areas: areas.length, entries: 1, docs: 1, missing: 0 });
    expect(await mem.get('D1')?.text()).toBe('%PDF plan');
    const s = getState();
    expect(s.settings).toMatchObject({ name: 'Leyre', onboarded: true, drive: { on: true } });
    expect(s.entries.map((e) => e.title)).toEqual(['Cena en el Txoko']);
    expect(s.areas.map((a) => a.name)).toEqual(areas);
    // Ese día no se sube copia automática (recuperando una copia vieja se perdería la de hoy)
    cita('Algo nuevo');
    expect(driveBackupDue()).toBe(false);
    expect(driveBackupDue(getState(), new Date(Date.now() + 86400000))).toBe(true);
  });

  it('un archivo grande se sube por partes', async () => {
    mem.set('D1', new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'application/pdf' }));
    await backupToDrive();
    expect(drive.calls.filter((c) => c.includes('resumable'))).toEqual(['POST /upload/drive/v3/files?resumable', 'PUT /upload/drive/v3/files?resumable']);
    expect(drive.live('archivo')[0].content.size).toBe(5 * 1024 * 1024);
  });

  it('si falta activar la API de Drive, lo explica con el enlace (y no insiste cada momento)', async () => {
    drive.fail(403, JSON.stringify({ error: { message: 'Google Drive API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123 then retry.', status: 'PERMISSION_DENIED' } }));
    const r = await backupToDrive();
    expect(r).toMatchObject({ status: 'error', link: 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123' });
    expect(getState().settings.drive?.error).toMatch(/activar la API de Google Drive/);
    expect(driveBackupDue()).toBe(false);
  });

  it('sin permiso de Drive no llama a Google: hay que conectarse', async () => {
    grant(GOOGLE_SCOPES);
    expect(await backupToDrive()).toEqual({ status: 'needs-auth' });
    expect(drive.calls).toEqual([]);
  });

  it('desactivada, no toca hacer copia', () => {
    start({ settings: { name: 'Leyre', onboarded: true, drive: { on: false } } as AppState['settings'] });
    expect(driveBackupDue()).toBe(false);
  });
});
