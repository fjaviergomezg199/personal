import { addDays, combine, toISODate } from './dates';
import { isDoneOn, nextBirthday, occurrencesBetween } from './recurrence';
import { categoryInfo } from './categories';
import type { AppState } from '../store/types';

export interface DueAlert {
  key: string;
  title: string;
  body: string;
  at: number;
  /** Ruta de la app a abrir al tocar el aviso. */
  route: string;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Avisos que tocan ahora (entre hace `lookbackMs` y ahora). Si un elemento ya
 * está en Google Calendar con su aviso, lo avisa Google y aquí se omite.
 */
export function dueAlerts(s: AppState, now: Date, lookbackMs = 6 * 3600000): DueAlert[] {
  const out: DueAlert[] = [];
  const nowMs = now.getTime();
  const from = toISODate(new Date(nowMs - lookbackMs - 86400000));
  const to = addDays(toISODate(now), 3);
  const googleOn = !!s.settings.google.clientId && s.settings.google.pushEntries;

  for (const e of s.entries) {
    if (e.alert === null || e.alert === undefined || !e.date) continue;
    if (googleOn && e.google && !e.dirty) continue;
    for (const date of occurrencesBetween(e, from, to)) {
      if (isDoneOn(e, date)) continue;
      const at = combine(date, e.time).getTime() - e.alert * 60000;
      if (at > nowMs || at < nowMs - lookbackMs) continue;
      const key = `e:${e.id}:${date}`;
      if (s.notified[key]) continue;
      const cat = categoryInfo(e.category);
      const when = e.time ? `${date === toISODate(now) ? 'Hoy' : date} a las ${e.time}` : 'Todo el día';
      out.push({
        key,
        title: `${cat ? cat.emoji + ' ' : '⏰ '}${e.title}`,
        body: [when, e.location, e.notes].filter(Boolean).join(' · ').slice(0, 180),
        at,
        route: `#/hoy?ver=${e.id}`,
      });
    }
  }

  const bAlert = s.settings.birthdayAlert;
  const googleB = !!s.settings.google.clientId && s.settings.google.pushBirthdays;
  if (bAlert !== null) {
    for (const b of s.birthdays) {
      if (googleB && b.google && !b.dirty) continue;
      const date = nextBirthday(b, from);
      const at = combine(date).getTime() - bAlert * 60000;
      if (at > nowMs || at < nowMs - lookbackMs) continue;
      const key = `b:${b.id}:${date}`;
      if (s.notified[key]) continue;
      out.push({
        key,
        title: `🎂 Cumpleaños de ${b.name}`,
        body: date === toISODate(now) ? '¡Es hoy! No te olvides de felicitar.' : `Es el ${date.slice(8)}/${date.slice(5, 7)}.${b.notes ? ` Ideas: ${b.notes}` : ''}`,
        at,
        route: '#/agenda?vista=cumples',
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function showSystemNotification(alert: DueAlert): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const url = new URL(alert.route, new URL('./', location.href)).href;
    await reg.showNotification(alert.title, {
      body: alert.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: alert.key,
      data: { url },
    });
    return true;
  } catch {
    return false;
  }
}
