import { Bell, MapPin, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { categoryInfo } from '../lib/categories';
import { formatRelative, todayISO } from '../lib/dates';
import { partnerName } from '../store/selectors';
import { getState, toggleEntryDone, updatePlanItem } from '../store/store';
import type { AgendaItem } from '../store/selectors';
import type { Area, Entry } from '../store/types';
import { openSheet } from './sheets';
import { Check } from './ui';

export function entryEmoji(e: Entry): string {
  const cat = categoryInfo(e.category);
  if (cat) return cat.emoji;
  if (e.kind === 'event') return '📅';
  if (e.kind === 'task') return '✅';
  return '⏰';
}

export function AreaBadge({ area }: { area?: Area }) {
  if (!area) return null;
  return (
    <span className={`badge tone-${area.color}`}>
      {area.emoji} {area.name}
    </span>
  );
}

/** «👥 Con Leyre» en los planes en pareja. */
export function SharedBadge() {
  const s = getState();
  if (!s.share) return null;
  const partner = partnerName(s);
  return <span className="badge tone-primary">👥 {partner ? `Con ${partner}` : 'En pareja'}</span>;
}

export function EntryRow(props: { entry: Entry; date?: string; done?: boolean; area?: Area; showDate?: boolean; overdue?: boolean; trail?: ReactNode }) {
  const { entry: e, area } = props;
  const date = props.date ?? e.date;
  const done = props.done ?? !!e.done;
  const completable = e.kind !== 'event';
  const cat = categoryInfo(e.category);
  return (
    <div
      className={`row tappable ${done ? 'done' : ''} ${area ? `tone-${area.color}` : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => openSheet({ type: 'entry', id: e.id, date })}
      onKeyDown={(ev) => ev.key === 'Enter' && openSheet({ type: 'entry', id: e.id, date })}
    >
      <div className="lead">
        {completable ? <Check on={done} onChange={() => toggleEntryDone(e.id, date)} /> : <span aria-hidden>{entryEmoji(e)}</span>}
      </div>
      <div className="body">
        <div className="title">
          {e.important && <span aria-label="Importante">⭐ </span>}
          {e.title}
        </div>
        <div className="meta">
          {props.showDate && date && (
            <span className={props.overdue ? 'badge danger' : ''} style={props.overdue ? undefined : { fontWeight: 600, color: 'var(--text)' }}>
              {formatRelative(date, todayISO())}
            </span>
          )}
          {e.time && (
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>
              {e.time}
              {e.endTime ? `–${e.endTime}` : ''}
            </span>
          )}
          {completable && cat && <span>{cat.emoji} {cat.label}</span>}
          {e.shared && <SharedBadge />}
          {area && <AreaBadge area={area} />}
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

export function AgendaRow({ item, showArea = true, trail }: { item: AgendaItem; showArea?: boolean; trail?: ReactNode }) {
  const trailEl = trail ? <div className="trail tiny">{trail}</div> : null;
  switch (item.kind) {
    case 'entry':
      return <EntryRow entry={item.entry} date={item.date} done={item.done} area={showArea ? item.area : undefined} trail={trail} />;
    case 'plan': {
      const p = item.item;
      return (
        <div
          className={`row tappable ${item.done ? 'done' : ''} tone-${item.area.color}`}
          role="button"
          tabIndex={0}
          onClick={() => openSheet({ type: 'plan', id: p.id })}
          onKeyDown={(ev) => ev.key === 'Enter' && openSheet({ type: 'plan', id: p.id })}
        >
          <div className="lead">
            <Check on={item.done} onChange={() => updatePlanItem(p.id, { done: !p.done })} />
          </div>
          <div className="body">
            <div className="title">{p.title}</div>
            <div className="meta">
              {p.time && <span style={{ fontWeight: 650, color: 'var(--text)' }}>{p.time}</span>}
              {showArea && <AreaBadge area={item.area} />}
              {p.result && <span>✍️ {p.result}</span>}
              {!p.result && p.details && <span className="ellipsis" style={{ maxWidth: '100%' }}>{p.details.split('\n')[0]}</span>}
            </div>
          </div>
          {trailEl}
        </div>
      );
    }
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
              {item.time ? (
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
