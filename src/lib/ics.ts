import { addDays, addMinutesToTime } from './dates';
import { birthdayInYear } from './recurrence';
import { rrule } from './sync';
import type { Birthday, Entry } from '../store/types';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line: string): string {
  const chars = Array.from(line); // sin partir emojis
  if (chars.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 73) parts.push((i ? ' ' : '') + chars.slice(i, i + 73).join(''));
  return parts.join('\r\n');
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = (d: string) => d.replace(/-/g, '');

function vevent(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].map(fold).join('\r\n');
}

function wrap(events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dia a Dia//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function alarm(minutes: number | null | undefined): string[] {
  if (minutes === null || minutes === undefined) return [];
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio', `TRIGGER:-PT${Math.max(0, minutes)}M`, 'END:VALARM'];
}

export function entryToIcs(e: Entry): string {
  const date = e.date!;
  const lines = [`UID:${e.id}@diaadia`, `DTSTAMP:${stamp()}`, `SUMMARY:${esc(e.title)}`];
  if (e.time) {
    const end = e.endTime && e.endTime > e.time ? e.endTime : addMinutesToTime(e.time, e.kind === 'event' ? 60 : 30);
    lines.push(`DTSTART:${compact(date)}T${e.time.replace(':', '')}00`, `DTEND:${compact(e.endDate ?? date)}T${end.replace(':', '')}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.endDate ?? date, 1))}`);
  }
  const desc = [e.notes, e.url].filter(Boolean).join('\n\n');
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  const rule = rrule(e.repeat, e.repeatUntil, !e.time);
  if (rule) lines.push(rule[0]);
  lines.push(...alarm(e.alert));
  return wrap([vevent(lines)]);
}

export function birthdayToIcs(b: Birthday, alert: number | null): string {
  const date = birthdayInYear(b, new Date().getFullYear());
  const lines = [
    `UID:b-${b.id}@diaadia`,
    `DTSTAMP:${stamp()}`,
    `SUMMARY:${esc(`🎂 Cumpleaños de ${b.name}`)}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
    'RRULE:FREQ=YEARLY',
    ...alarm(alert),
  ];
  return wrap([vevent(lines)]);
}

export function icsFileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return `${base || 'evento'}.ics`;
}
