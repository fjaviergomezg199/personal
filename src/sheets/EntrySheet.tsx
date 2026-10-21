import { CalendarPlus, Check as CheckIcon, Download, ExternalLink, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet, toast } from '../components/ui';
import { categoryInfo } from '../lib/categories';
import { formatLong, todayISO } from '../lib/dates';
import { saveFile, shareText } from '../lib/files';
import { googleTemplateUrl } from '../lib/google';
import { entryToIcs, icsFileName } from '../lib/ics';
import { isDoneOn } from '../lib/recurrence';
import { rrule } from '../lib/sync';
import { deleteEntry, restoreEntry, toggleEntryDone, updateEntry, useApp } from '../store/store';
import type { Entry, ID, ISODate } from '../store/types';
import { EntryFields, type EntryDraft } from './EntryForm';

const KIND_TITLE: Record<Entry['kind'], string> = { reminder: 'Recordatorio', event: 'Plan', task: 'Tarea' };

function toDraft(e: Entry): EntryDraft {
  const { kind, title, date, time, endTime, endDate, repeat, repeatUntil, alert, areaId, category, location, url, notes, important } = e;
  return { kind, title, date, time, endTime, endDate, repeat, repeatUntil, alert, areaId, category, location, url, notes, important };
}

export function entryShareText(e: Entry): string {
  const cat = categoryInfo(e.category);
  const lines = [`${cat ? cat.emoji + ' ' : ''}${e.title}`];
  if (e.date) lines.push(`${formatLong(e.date)}${e.time ? ` · ${e.time}${e.endTime ? `–${e.endTime}` : ''}` : ''}`);
  if (e.location) lines.push(`📍 ${e.location}`);
  if (e.url) lines.push(e.url);
  if (e.notes) lines.push('', e.notes);
  return lines.join('\n');
}

export function EntrySheet(props: { id: ID; date?: ISODate; onClose: () => void }) {
  const state = useApp();
  const entry = state.entries.find((e) => e.id === props.id);
  const [draft, setDraft] = useState<EntryDraft | null>(() => (entry ? toDraft(entry) : null));
  if (!entry || !draft) {
    return (
      <Sheet open onClose={props.onClose} title="No encontrado">
        <p className="muted">Este elemento ya no existe.</p>
      </Sheet>
    );
  }
  const occurrence = props.date ?? entry.date ?? todayISO();
  const done = isDoneOn(entry, occurrence);
  const completable = entry.kind !== 'event';
  const g = state.settings.google;
  const syncing = !!g.clientId && g.pushEntries && !!g.email;

  const save = () => {
    if (!draft.title.trim()) return;
    updateEntry(entry.id, { ...draft, title: draft.title.trim() });
    toast('Cambios guardados');
    props.onClose();
  };

  const remove = () => {
    const copy = structuredClone(entry);
    deleteEntry(entry.id);
    props.onClose();
    toast('Borrado', { action: 'Deshacer', onAction: () => restoreEntry(copy) });
  };

  const gUrl = entry.date
    ? googleTemplateUrl({
        title: entry.title,
        date: entry.date,
        time: entry.time,
        endTime: entry.endTime,
        endDate: entry.endDate,
        details: [entry.notes, entry.url].filter(Boolean).join('\n\n'),
        location: entry.location,
        recur: rrule(entry.repeat, entry.repeatUntil, !entry.time)?.[0],
      })
    : undefined;

  return (
    <Sheet
      open
      onClose={props.onClose}
      title={KIND_TITLE[entry.kind]}
      headerExtra={
        <button className="icon-btn small" onClick={remove} aria-label="Borrar">
          <Trash2 size={17} />
        </button>
      }
      footer={
        <button className="btn block" onClick={save} disabled={!draft.title.trim()}>
          Guardar cambios
        </button>
      }
    >
      {completable && (
        <button
          className={`btn block ${done ? 'secondary' : 'tone'} tone-primary`}
          style={{ marginBottom: 16 }}
          onClick={() => {
            toggleEntryDone(entry.id, occurrence);
            if (!done) {
              toast('¡Hecho! 🎉');
              props.onClose();
            }
          }}
        >
          <CheckIcon size={18} /> {done ? 'Marcar como pendiente' : entry.repeat !== 'none' ? 'Hecho por hoy' : 'Marcar como hecho'}
        </button>
      )}

      <EntryFields
        draft={draft}
        showTitle
        startOpen={!!(entry.notes || entry.url || entry.location || entry.areaId || entry.category)}
        onChange={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
      />

      <div className="divider" />
      <div className="stack">
        {entry.url && (
          <a className="btn secondary block" href={entry.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} /> Abrir enlace
          </a>
        )}
        <button
          className="btn secondary block"
          onClick={async () => {
            const r = await shareText(entryShareText(entry), entry.title);
            if (r === 'copied') toast('Copiado al portapapeles');
          }}
        >
          <Share2 size={18} /> Compartir
        </button>
        {entry.date && !syncing && (
          <>
            <a className="btn secondary block" href={gUrl} target="_blank" rel="noopener noreferrer">
              <CalendarPlus size={18} /> Añadir a Google Calendar
            </a>
            <button className="btn secondary block" onClick={() => saveFile(new Blob([entryToIcs(entry)], { type: 'text/calendar' }), icsFileName(entry.title))}>
              <Download size={18} /> Calendario del móvil (.ics)
            </button>
          </>
        )}
      </div>
      {syncing && entry.date && (
        <p className="hint center mt12">
          {entry.google && !entry.dirty ? '✓ En tu Google Calendar' : '⏳ Pendiente de enviar a Google Calendar'}
        </p>
      )}
    </Sheet>
  );
}
