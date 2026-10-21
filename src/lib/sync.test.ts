import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeGoogleRedirect, hasValidToken } from './google';
import { pendingGoogleChanges, syncGoogle } from './sync';
import { deleteEntry, getState, normalizeState, replaceState, updateEntry } from '../store/store';
import type { AppState, Entry } from '../store/types';

/* ---------- Entorno de navegador mínimo ---------- */

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const loc = { href: '', hash: '', pathname: '/personal/', search: '', origin: 'https://x.github.io', assign: vi.fn() };

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  loc.hash = '';
  loc.href = 'https://x.github.io/personal/';
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', {
    replaceState: (_s: unknown, _t: string, url: string) => {
      loc.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});


const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function entry(p: Partial<Entry>): Entry {
  return { id: 'e1', kind: 'reminder', title: 'Dentista', date: plus(1), time: '10:00', repeat: 'none', alert: 15, dirty: true, createdAt: 'c', updatedAt: 'u1', ...p };
}

function setup(partial: Partial<AppState>) {
  const s = normalizeState({
    ...partial,
    settings: {
      ...normalizeState(undefined).settings,
      onboarded: true,
      google: { ...normalizeState(undefined).settings.google, clientId: 'abc.apps.googleusercontent.com', email: 'yo@gmail.com' },
    },
  });
  replaceState(s);
  localStorage.setItem('diaadia:gtoken', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 3600_000 }));
}

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function fakeGoogle(opts: { status?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    if (opts.status) return new Response('{"error":"x"}', { status: opts.status });
    if (url.includes('/users/me/calendarList')) {
      return Response.json({ items: [{ id: 'yo@gmail.com', summary: 'Yo', primary: true, accessRole: 'owner', backgroundColor: '#4285f4' }, { id: 'fest@group', summary: 'Festivos', accessRole: 'reader' }] });
    }
    if (method === 'GET' && url.includes('/events?')) {
      return Response.json({
        items: [
          { id: 'ext1', summary: 'Boda de Pablo', start: { date: plus(3) }, end: { date: plus(4) }, htmlLink: 'https://cal/x' },
          { id: 'ext2', summary: 'Reunión', start: { dateTime: `${plus(2)}T09:30:00+02:00` }, end: { dateTime: `${plus(2)}T10:30:00+02:00` } },
          { id: 'mine', summary: 'Ya enviado', start: { date: plus(1) }, end: { date: plus(2) }, extendedProperties: { private: { diaadia: 'e9' } } },
        ],
      });
    }
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (method === 'PUT') return Response.json({ id: url.split('/').pop() });
    return Response.json({ id: `g${++n}` });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('sincronización con Google Calendar', () => {
  it('envía lo pendiente, guarda el id y trae los eventos ajenos', async () => {
    setup({
      entries: [entry({}), entry({ id: 'old', title: 'Viejo', date: '2020-01-01', time: undefined })],
      birthdays: [{ id: 'b1', name: 'Marta', day: 12, month: 3, dirty: true, createdAt: 'c', updatedAt: 'u' }],
    });
    expect(pendingGoogleChanges()).toBe(3);
    const calls = fakeGoogle();
    const r = await syncGoogle();
    expect(r).toMatchObject({ status: 'ok', errors: [] });

    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2); // el recordatorio y el cumpleaños (lo viejo no)
    expect(posts[0].url).toContain('/calendars/primary/events');
    expect(posts[0].body).toMatchObject({
      summary: 'Dentista',
      start: { dateTime: `${plus(1)}T10:00:00` },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
      extendedProperties: { private: { diaadia: 'e1' } },
    });
    expect(posts[1].body).toMatchObject({ summary: '🎂 Cumpleaños de Marta', recurrence: ['RRULE:FREQ=YEARLY'] });

    const s = getState();
    expect(s.entries.find((e) => e.id === 'e1')).toMatchObject({ google: { id: 'g1', calendarId: 'primary' }, dirty: false });
    expect(s.entries.find((e) => e.id === 'old')).toMatchObject({ dirty: false });
    expect(s.entries.find((e) => e.id === 'old')?.google).toBeUndefined();
    expect(s.birthdays[0]).toMatchObject({ google: { id: 'g2' }, dirty: false });
    expect(s.googleEvents.map((g) => g.title)).toEqual(['Boda de Pablo', 'Reunión']);
    expect(s.googleEvents[1]).toMatchObject({ date: plus(2), calendarId: 'primary' });
    expect(s.googleCalendars).toHaveLength(2);
    expect(pendingGoogleChanges()).toBe(0);
  });

  it('actualiza con PUT y borra con DELETE', async () => {
    setup({ entries: [entry({ google: { id: 'g7', calendarId: 'primary' }, dirty: false })] });
    let calls = fakeGoogle();
    updateEntry('e1', { time: '11:00' });
    await syncGoogle();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toContain('/calendars/primary/events/g7');
    expect(put?.body).toMatchObject({ start: { dateTime: `${plus(1)}T11:00:00` } });

    calls = fakeGoogle();
    deleteEntry('e1');
    expect(getState().googleDeletes).toEqual([{ id: 'g7', calendarId: 'primary' }]);
    await syncGoogle();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toContain('/events/g7');
    expect(getState().googleDeletes).toEqual([]);
  });

  it('si Google responde 401 pide reconectar y olvida el permiso', async () => {
    setup({ entries: [entry({})] });
    fakeGoogle({ status: 401 });
    const r = await syncGoogle();
    expect(r.status).toBe('needs-auth');
    expect(hasValidToken()).toBe(false);
    expect(getState().entries[0].dirty).toBe(true);
  });

  it('un evento borrado en Google se vuelve a crear', async () => {
    setup({ entries: [entry({ google: { id: 'gone', calendarId: 'primary' } })] });
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ method, url });
        if (method === 'PUT') return new Response('gone', { status: 410 });
        if (method === 'POST') return Response.json({ id: 'nuevo' });
        return Response.json({ items: [] });
      }),
    );
    await syncGoogle();
    expect(calls.map((c) => c.method).slice(0, 2)).toEqual(['PUT', 'POST']);
    expect(getState().entries[0].google).toEqual({ id: 'nuevo', calendarId: 'primary' });
  });
});

describe('vuelta de Google (OAuth)', () => {
  it('guarda el permiso y vuelve a la pantalla de antes', () => {
    localStorage.setItem('diaadia:gauth', JSON.stringify({ state: 'S1', route: '#/ajustes', silent: false, fallback: false }));
    loc.hash = '#access_token=abc&token_type=Bearer&expires_in=3599&state=S1&scope=x';
    expect(consumeGoogleRedirect()).toEqual({ status: 'ok' });
    expect(hasValidToken()).toBe(true);
    expect(loc.hash).toBe('#/ajustes');
  });

  it('error en la renovación silenciosa', () => {
    localStorage.setItem('diaadia:gauth', JSON.stringify({ state: 'S2', route: '#/hoy', silent: true, fallback: true, email: 'yo@gmail.com' }));
    loc.hash = '#error=interaction_required&state=S2';
    expect(consumeGoogleRedirect()).toEqual({ status: 'error', error: 'interaction_required', silent: true, fallback: true, email: 'yo@gmail.com' });
  });

  it('rechaza un state que no coincide', () => {
    localStorage.setItem('diaadia:gauth', JSON.stringify({ state: 'S3', route: '#/hoy', silent: false, fallback: false }));
    loc.hash = '#access_token=abc&state=OTRO';
    expect(consumeGoogleRedirect()).toMatchObject({ status: 'error', error: 'state_mismatch' });
    expect(hasValidToken()).toBe(false);
  });

  it('ignora las rutas normales', () => {
    loc.hash = '#/agenda?vista=lista';
    expect(consumeGoogleRedirect()).toBeNull();
  });
});


