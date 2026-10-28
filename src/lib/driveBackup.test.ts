import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEntry, getState, normalizeState, replaceState } from '../store/store';
import type { AppState } from '../store/types';
import { backupToDrive, driveBackupDue, KEEP_COPIES, listDriveCopies, restoreFromDrive } from './driveBackup';
import { DRIVE_SCOPE, GOOGLE_SCOPES } from './google';
import { fakeDrive } from './testing/fakeDrive';

vi.mock('../store/db', () => ({
  files: { get: async () => undefined, put: async () => undefined, del: async () => undefined },
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
      categories: [{ id: 'c1', name: '2Sigma', color: 'blue', order: 0, createdAt: now }],
      ...extra,
    } as unknown as Partial<AppState>),
  );
}
const cita = (title: string) => addEntry({ kind: 'event', title, date: '2026-10-24', time: '21:30', repeat: 'none', alert: null });

let drive: ReturnType<typeof fakeDrive>;
beforeEach(() => {
  storage.clear();
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
    expect(r).toEqual({ status: 'ok', copies: 1 });
    const [folder] = drive.live('carpeta');
    expect(folder.name).toBe('Día a Día · copias');
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
    expect(await backupToDrive()).toEqual({ status: 'ok', copies: 1 });
    const copies = drive.live('copia');
    expect(copies).toHaveLength(1);
    expect(JSON.parse(await copies[0].content.text()).state.entries).toHaveLength(1);
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

  it('en un móvil nuevo recupera la copia', async () => {
    cita('Cena en el Txoko');
    await backupToDrive();
    // Móvil nuevo: sin datos
    replaceState(normalizeState({ settings: { name: '', onboarded: false, google: { clientId: 'cid' } } } as unknown as Partial<AppState>));
    const copies = await listDriveCopies();
    expect(copies).toHaveLength(1);
    const r = await restoreFromDrive(copies[0]);
    expect(r).toEqual({ categories: 1, entries: 1 });
    const s = getState();
    expect(s.settings).toMatchObject({ name: 'Leyre', onboarded: true, drive: { on: true } });
    expect(s.entries.map((e) => e.title)).toEqual(['Cena en el Txoko']);
    expect(s.categories.map((c) => c.name)).toEqual(['2Sigma']);
    // Ese día no se sube copia automática (recuperando una copia vieja se perdería la de hoy)
    cita('Algo nuevo');
    expect(driveBackupDue()).toBe(false);
    expect(driveBackupDue(getState(), new Date(Date.now() + 86400000))).toBe(true);
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
