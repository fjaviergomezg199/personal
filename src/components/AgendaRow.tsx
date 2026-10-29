import { Bell, MapPin, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatRelative, formatSpan, todayISO } from '../lib/dates';
import { toggleEntryDone } from '../store/store';
import type { AgendaItem } from '../store/selectors';
import type { Category, Entry } from '../store/types';
import { openSheet } from './sheets';
import { Check } from './ui';

/** «● 2Sigma», del color de la categoría. */
export function CategoryBadge({ category }: { category?: Category }) {
  if (!category) return null;
  return (
    <span className={`cat-badge tone-${category.color}`}>
      <i aria-hidden />
      {category.emoji ? `${category.emoji} ` : ''}
      {category.name}
    </span>
  );
}

export function EntryRow(props: {
  entry: Entry;
  date?: string;
  done?: boolean;
  category?: Category;
  showDate?: boolean;
  overdue?: boolean;
  /** La primera línea de las notas, para leerla sin abrir. */
  showNotes?: boolean;
  /** Qué hacer al marcarla (si no, solo se marca). */
  onToggle?: () => void;
  trail?: ReactNode;
}) {
  const { entry: e, category } = props;
  const date = props.date ?? e.date;
  const done = props.done ?? !!e.done;
  const completable = e.kind !== 'event';
  const note = props.showNotes ? e.notes?.trim().split('\n')[0] : undefined;
  return (
    <div
      className={`row tappable ${done ? 'done' : ''} ${category ? `has-cat tone-${category.color}` : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => openSheet({ type: 'entry', id: e.id, date })}
      onKeyDown={(ev) => ev.key === 'Enter' && openSheet({ type: 'entry', id: e.id, date })}
    >
      <div className="lead">
        {completable ? <Check on={done} onChange={props.onToggle ?? (() => toggleEntryDone(e.id, date))} /> : <span className="ev-dot" aria-hidden />}
      </div>
      <div className="body">
        <div className="title">
          {e.important && <span aria-label="Importante">⭐ </span>}
          {e.title}
        </div>
        {note && <div className="note ellipsis">{note}</div>}
        <div className="meta">
          {props.showDate && date && (
            <span className={props.overdue ? 'badge danger' : ''} style={props.overdue ? undefined : { fontWeight: 600, color: 'var(--text)' }}>
              {formatRelative(date, todayISO())}
            </span>
          )}
          {e.date && e.endDate && e.endDate > e.date && e.repeat === 'none' && (
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>{formatSpan(e.date, e.endDate)}</span>
          )}
          {e.time && (
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>
              {e.time}
              {e.endTime ? `–${e.endTime}` : ''}
            </span>
          )}
          <CategoryBadge category={category} />
          {e.repeat !== 'none' && (
            <span aria-label="Se repite">
              <Repeat size={13} />
            </span>
          )}
          {e.alert !== null && e.alert !== undefined && !done && (
            <span aria-label="Con aviso">
              <Bell size={13} />
            </span>
          )}
          {e.location && (
            <span>
              <MapPin size={13} /> {e.location}
            </span>
          )}
        </div>
      </div>
      {props.trail && <div className="trail tiny">{props.trail}</div>}
    </div>
  );
}

export function AgendaRow({ item, trail }: { item: AgendaItem; trail?: ReactNode }) {
  const trailEl = trail ? <div className="trail tiny">{trail}</div> : null;
  switch (item.kind) {
    case 'entry':
      return <EntryRow entry={item.entry} date={item.date} done={item.done} category={item.category} trail={trail} />;
    case 'birthday': {
      const b = item.birthday;
      return (
        <div className="row tappable" role="button" tabIndex={0} onClick={() => openSheet({ type: 'birthday', id: b.id })}>
          <div className="lead" aria-hidden>
            🎂
          </div>
          <div className="body">
            <div className="title">Cumpleaños de {b.name}</div>
            <div className="meta">{item.age ? <span>Cumple {item.age} años</span> : <span>¡Felicítale!</span>}</div>
          </div>
          {trailEl}
        </div>
      );
    }
    case 'google': {
      const g = item.event;
      return (
        <div className="row tappable" role="button" tabIndex={0} onClick={() => openSheet({ type: 'google', event: g })}>
          <div className="lead" aria-hidden>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: g.color ?? 'var(--primary)', display: 'inline-block' }} />
          </div>
          <div className="body">
            <div className="title">{g.title}</div>
            <div className="meta">
              {g.endDate && g.endDate > g.date ? (
                <span style={{ fontWeight: 650, color: 'var(--text)' }}>{formatSpan(g.date, g.endDate)}</span>
              ) : item.time ? (
                <span style={{ fontWeight: 650, color: 'var(--text)' }}>
                  {item.time}
                  {g.endTime ? `–${g.endTime}` : ''}
                </span>
              ) : (
                <span>Todo el día</span>
              )}
              <span>Google Calendar</span>
              {g.location && (
                <span>
                  <MapPin size={13} /> {g.location}
                </span>
              )}
            </div>
          </div>
          {trailEl}
        </div>
      );
    }
  }
}
