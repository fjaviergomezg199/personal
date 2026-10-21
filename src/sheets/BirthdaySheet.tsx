import { MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet, toast } from '../components/ui';
import { ageOn, formatLong, todayISO } from '../lib/dates';
import { nextBirthday } from '../lib/recurrence';
import { addBirthday, deleteBirthday, restoreBirthday, updateBirthday, useApp } from '../store/store';
import type { ID } from '../store/types';
import { BirthdayFields, validBirthday, type BirthdayDraft } from './BirthdayFields';

export function BirthdaySheet(props: { id?: ID; onClose: () => void }) {
  const state = useApp();
  const b = props.id ? state.birthdays.find((x) => x.id === props.id) : undefined;
  const [draft, setDraft] = useState<BirthdayDraft>(() => (b ? { name: b.name, day: b.day, month: b.month, year: b.year, notes: b.notes } : { name: '' }));
  const today = todayISO();
  const next = b ? nextBirthday(b, today) : undefined;
  const isToday = next === today;

  const save = () => {
    if (!validBirthday(draft)) return;
    const data = { name: draft.name.trim(), day: draft.day!, month: draft.month!, year: draft.year, notes: draft.notes };
    if (b) updateBirthday(b.id, data);
    else addBirthday(data);
    toast(b ? 'Cambios guardados' : `🎂 Cumpleaños de ${data.name} guardado`);
    props.onClose();
  };

  return (
    <Sheet
      open
      onClose={props.onClose}
      title={b ? `🎂 ${b.name}` : 'Nuevo cumpleaños'}
      headerExtra={
        b && (
          <button
            className="icon-btn small"
            aria-label="Borrar"
            onClick={() => {
              const copy = structuredClone(b);
              deleteBirthday(b.id);
              props.onClose();
              toast('Cumpleaños borrado', { action: 'Deshacer', onAction: () => restoreBirthday(copy) });
            }}
          >
            <Trash2 size={17} />
          </button>
        )
      }
      footer={
        <button className="btn block" onClick={save} disabled={!validBirthday(draft)}>
          Guardar
        </button>
      }
    >
      {b && next && (
        <div className="banner tone-pink" style={{ marginBottom: 16 }}>
          <div className="big">🎉</div>
          <div className="grow">
            <div className="t">{isToday ? '¡Es hoy!' : formatLong(next)}</div>
            <div className="d">{ageOn(b.year, next) ? `Cumple ${ageOn(b.year, next)} años` : 'Próximo cumpleaños'}</div>
          </div>
          {isToday && (
            <a
              className="btn small tone"
              href={`https://wa.me/?text=${encodeURIComponent(`¡Feliz cumpleaños, ${b.name}! 🎉🎂`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> Felicitar
            </a>
          )}
        </div>
      )}
      <BirthdayFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
    </Sheet>
  );
}
