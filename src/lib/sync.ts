import { categoryInfo } from './categories';
import { addDays, addMinutesToTime, todayISO, toHHMM, toISODate } from './dates';
import { GoogleApiError, GoogleAuthError, gcal, hasValidToken, type GCalEvent } from './google';
import { birthdayInYear } from './recurrence';
import { getState, setGoogleData, update, updateGoogle } from '../store/store';
import type { Birthday, Entry, GoogleCalendarInfo, GoogleEvent, GoogleLink, Repeat } from '../store/types';

const APP_TAG = 'diaadia';

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  } catch {
    return 'Europe/Madrid';
  }
}

export function rrule(repeat: Repeat, until?: string, allDay = false): string[] | undefined {
  if (repeat === 'none') return undefined;
  const freq: Record<Exclude<Repeat, 'none'>, string> = {
    daily: 'FREQ=DAILY',
    weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    weekly: 'FREQ=WEEKLY',
    monthly: 'FREQ=MONTHLY',
    yearly: 'FREQ=YEARLY',
  };
  let rule = `RRULE:${freq[repeat]}`;
  if (until) rule += allDay ? `;UNTIL=${until.replace(/-/g, '')}` : `;UNTIL=${until.replace(/-/g, '')}T235959Z`;
  return [rule];
}

export function entryToGoogle(e: Entry): Partial<GCalEvent> {
  const tz = timeZone();
  const cat = categoryInfo(e.category);
  const prefix = e.kind === 'task' ? '✅ ' : cat ? `${cat.emoji} ` : '';
  const summary = `${e.done ? '✓ ' : ''}${prefix}${e.title}`;
  const description = [e.notes, e.url, '— Creado con Día a Día'].filter(Boolean).join('\n\n');
  const date = e.date!;
  let start: GCalEvent['start'];
  let end: GCalEvent['end'];
  if (e.time) {
    const endTime = e.endTime && e.endTime > e.time ? e.endTime : addMinutesToTime(e.time, e.kind === 'event' ? 60 : 30);
    start = { dateTime: `${date}T${e.time}:00`, timeZone: tz };
    end = { dateTime: `${e.endDate && e.endDate > date ? e.endDate : date}T${endTime}:00`, timeZone: tz };
  } else {
    start = { date };
    end = { date: addDays(e.endDate && e.endDate > date ? e.endDate : date, 1) };
  }
  return {
    summary,
    description,
    location: e.location || undefined,
    start,
    end,
    recurrence: rrule(e.repeat, e.repeatUntil, !e.time),
    reminders: { useDefault: false, overrides: e.alert !== null && e.alert !== undefined && !e.done ? [{ method: 'popup', minutes: Math.max(0, e.alert) }] : [] },
    extendedProperties: { private: { [APP_TAG]: e.id } },
  };
}

export function birthdayToGoogle(b: Birthday, alert: number | null): Partial<GCalEvent> {
  const year = new Date().getFullYear();
  const date = birthdayInYear(b, year);
  return {
    summary: `🎂 Cumpleaños de ${b.name}`,
    description: [b.year ? `Nació en ${b.year}.` : '', b.notes ? `Ideas: ${b.notes}` : '', '— Creado con Día a Día'].filter(Boolean).join('\n\n'),
    start: { date },
    end: { date: addDays(date, 1) },
    recurrence: ['RRULE:FREQ=YEARLY'],
    reminders: { useDefault: false, overrides: alert !== null ? [{ method: 'popup', minutes: Math.max(0, alert) }] : [] },
    extendedProperties: { private: { [APP_TAG]: `b-${b.id}` } },
  };
}

function toLocal(d: GCalEvent['start']): { date: string; time?: string } {
  if (d.date) return { date: d.date };
  const dt = new Date(d.dateTime!);
  return { date: toISODate(dt), time: toHHMM(dt) };
}

export function googleToCache(ev: GCalEvent, calendarId: string, color?: string): GoogleEvent | null {
  if (ev.status === 'cancelled') return null;
  if (ev.extendedProperties?.private?.[APP_TAG]) return null; // es nuestro
  const s = toLocal(ev.start);
  const e = toLocal(ev.end);
  let endDate: string | undefined;
  if (ev.start.date && ev.end.date) {
    const last = addDays(ev.end.date, -1);
    endDate = last > s.date ? last : undefined;
  } else if (e.date > s.date) endDate = e.date;
  return {
    id: ev.id,
    calendarId,
    title: ev.summary?.trim() || '(Sin título)',
    date: s.date,
    endDate,
    time: s.time,
    endTime: e.date === s.date ? e.time : undefined,
    location: ev.location,
    link: ev.htmlLink,
    color,
  };
}

export type SyncResult =
  | { status: 'ok'; pushed: number; pulled: number; errors: string[] }
  | { status: 'needs-auth' }
  | { status: 'offline' }
  | { status: 'not-configured' };

let running: Promise<SyncResult> | null = null;

export function pendingGoogleChanges(): number {
  const s = getState();
  const g = s.settings.google;
  let n = s.googleDeletes.length;
  if (g.pushEntries) n += s.entries.filter((e) => e.dirty && (e.date || e.google)).length;
  if (g.pushBirthdays) n += s.birthdays.filter((b) => b.dirty).length;
  return n;
}

export function syncGoogle(): Promise<SyncResult> {
  if (!running) running = doSync().finally(() => (running = null));
  return running;
}

const isGone = (err: unknown) => err instanceof GoogleApiError && (err.status === 404 || err.status === 410);

async function doSync(): Promise<SyncResult> {
  const settings = getState().settings.google;
  if (!settings.clientId) return { status: 'not-configured' };
  if (!hasValidToken()) return { status: 'needs-auth' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };

  const errors: string[] = [];
  let pushed = 0;
  try {
    // 1) Borrados pendientes
    for (const link of [...getState().googleDeletes]) {
      try {
        await gcal.remove(link.calendarId, link.id);
      } catch (err) {
        if (err instanceof GoogleAuthError) throw err;
        if (!isGone(err)) {
          errors.push(String((err as Error).message));
          continue;
        }
      }
      update((s) => {
        s.googleDeletes = s.googleDeletes.filter((d) => !(d.id === link.id && d.calendarId === link.calendarId));
      }, { silent: true });
      pushed++;
    }

    const upsert = async (link: GoogleLink | undefined, body: Partial<GCalEvent>, calendarId: string): Promise<GoogleLink> => {
      if (link) {
        try {
          const ev = await gcal.update(link.calendarId, link.id, body);
          return { id: ev.id, calendarId: link.calendarId };
        } catch (err) {
          if (!isGone(err)) throw err;
        }
      }
      const ev = await gcal.insert(calendarId, body);
      return { id: ev.id, calendarId };
    };

    // 2) Recordatorios, planes y tareas con fecha
    if (settings.pushEntries) {
      const oldLimit = addDays(todayISO(), -7);
      for (const e of getState().entries.filter((x) => x.dirty)) {
        try {
          if (!e.google && e.repeat === 'none' && e.date && (e.endDate ?? e.date) < oldLimit) {
            // Cosas pasadas que nunca se enviaron: no llenamos Google de historia.
            update((s) => {
              const x = s.entries.find((y) => y.id === e.id);
              if (x && x.updatedAt === e.updatedAt) x.dirty = false;
            }, { silent: true });
            continue;
          }
          if (!e.date) {
            if (e.google) {
              try {
                await gcal.remove(e.google.calendarId, e.google.id);
              } catch (err) {
                if (!isGone(err)) throw err;
              }
            }
            update((s) => {
              const x = s.entries.find((y) => y.id === e.id);
              if (x && x.updatedAt === e.updatedAt) {
                x.dirty = false;
                delete x.google;
              }
            }, { silent: true });
            continue;
          }
          const link = await upsert(e.google, entryToGoogle(e), settings.writeCalendarId || 'primary');
          update((s) => {
            const x = s.entries.find((y) => y.id === e.id);
            if (!x) {
              s.googleDeletes.push(link); // lo borraron mientras se enviaba
              return;
            }
            x.google = link;
            if (x.updatedAt === e.updatedAt) x.dirty = false;
          }, { silent: true });
          pushed++;
        } catch (err) {
          if (err instanceof GoogleAuthError) throw err;
          errors.push(`${e.title}: ${(err as Error).message}`);
        }
      }
    }

    // 3) Cumpleaños
    if (settings.pushBirthdays) {
      const alert = getState().settings.birthdayAlert;
      for (const b of getState().birthdays.filter((x) => x.dirty)) {
        try {
          const link = await upsert(b.google, birthdayToGoogle(b, alert), settings.writeCalendarId || 'primary');
          update((s) => {
            const x = s.birthdays.find((y) => y.id === b.id);
            if (!x) {
              s.googleDeletes.push(link);
              return;
            }
            x.google = link;
            if (x.updatedAt === b.updatedAt) x.dirty = false;
          }, { silent: true });
          pushed++;
        } catch (err) {
          if (err instanceof GoogleAuthError) throw err;
          errors.push(`${b.name}: ${(err as Error).message}`);
        }
      }
    }

    // 4) Calendarios y eventos de Google para la agenda
    let calendars: GoogleCalendarInfo[] | null = null;
    try {
      const list = await gcal.calendars();
      calendars = list.map((c) => ({
        id: c.id,
        name: c.summaryOverride || c.summary,
        color: c.backgroundColor,
        primary: !!c.primary,
        canWrite: c.accessRole === 'owner' || c.accessRole === 'writer',
      }));
      const primary = list.find((c) => c.primary);
      if (primary && primary.id !== settings.email) updateGoogle({ email: primary.id });
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err;
      errors.push(`Calendarios: ${(err as Error).message}`);
    }

    const today = todayISO();
    const timeMin = new Date(`${addDays(today, -31)}T00:00:00`);
    const timeMax = new Date(`${addDays(today, 186)}T00:00:00`);
    const events: GoogleEvent[] = [];
    const readIds = getState().settings.google.readCalendarIds;
    const primaryId = calendars?.find((c) => c.primary)?.id;
    for (const calId of readIds) {
      try {
        const color = calendars?.find((c) => c.id === calId || (calId === 'primary' && c.primary))?.color;
        const list = await gcal.events(calId, timeMin, timeMax);
        const storeId = calId === 'primary' && primaryId ? 'primary' : calId;
        for (const ev of list) {
          const cached = googleToCache(ev, storeId, color);
          if (cached) events.push(cached);
        }
      } catch (err) {
        if (err instanceof GoogleAuthError) throw err;
        errors.push(`Eventos: ${(err as Error).message}`);
      }
    }
    setGoogleData(events, calendars);
    updateGoogle({ lastSync: new Date().toISOString() });
    return { status: 'ok', pushed, pulled: events.length, errors };
  } catch (err) {
    if (err instanceof GoogleAuthError) return { status: 'needs-auth' };
    if (err instanceof TypeError) return { status: 'offline' };
    return { status: 'ok', pushed, pulled: 0, errors: [...errors, String((err as Error).message)] };
  }
}
