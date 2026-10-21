import { ExternalLink, MapPin } from 'lucide-react';
import { Sheet } from '../components/ui';
import { capitalize, formatLong } from '../lib/dates';
import { useApp } from '../store/store';
import type { GoogleEvent } from '../store/types';

export function GoogleEventSheet({ event: g, onClose }: { event: GoogleEvent; onClose: () => void }) {
  const state = useApp();
  const cal = state.googleCalendars.find((c) => c.id === g.calendarId || (g.calendarId === 'primary' && c.primary));
  return (
    <Sheet open onClose={onClose} title="Google Calendar">
      <div className="hstack" style={{ alignItems: 'flex-start' }}>
        <span style={{ width: 14, height: 14, borderRadius: 4, background: g.color ?? 'var(--primary)', marginTop: 7, flexShrink: 0 }} />
        <div>
          <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25 }}>{g.title}</h2>
          <div className="muted mt8">
            {capitalize(formatLong(g.date))}
            {g.endDate ? ` – ${formatLong(g.endDate)}` : ''}
            {g.time ? ` · ${g.time}${g.endTime ? `–${g.endTime}` : ''}` : ' · Todo el día'}
          </div>
          {g.location && (
            <div className="muted mt8 hstack">
              <MapPin size={15} /> {g.location}
            </div>
          )}
          {cal && <div className="faint small mt8">Calendario: {cal.name}</div>}
        </div>
      </div>
      {g.link && (
        <a className="btn secondary block mt24" href={g.link} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={18} /> Abrir en Google Calendar
        </a>
      )}
      <p className="hint center mt12">Los eventos de Google se editan en Google Calendar.</p>
    </Sheet>
  );
}
