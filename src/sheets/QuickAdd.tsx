import { useMemo, useRef, useState } from 'react';
import { formatRelative, todayISO } from '../lib/dates';
import { parseQuick } from '../lib/quickParse';
import { addBirthday, addEntry, deleteBirthday, deleteEntry, useApp } from '../store/store';
import type { EntryKind, HHMM, ID, ISODate } from '../store/types';
import { Sheet, toast } from '../components/ui';
import { BirthdayFields, validBirthday, type BirthdayDraft } from './BirthdayFields';
import { EntryFields, KIND_OPTIONS, type EntryDraft } from './EntryForm';

const EXAMPLES = [
  'mañana a las 10 dentista',
  'cumple de Marta 12/03',
  'entradas Rosalía viernes 10:00',
  'todos los lunes 9:00 reunión academia',
  'cena el sábado a las 21:30',
  'comprar regalo de Ana',
];

type Kind = EntryKind | 'birthday';

export function QuickAddSheet(props: { onClose: () => void; date?: ISODate; time?: HHMM; areaId?: ID; kind?: Kind; text?: string }) {
  const state = useApp();
  const [text, setText] = useState(props.text ?? '');
  // Lo que se toca a mano manda; la fecha/hora con la que se abrió es solo el valor por defecto.
  const [manual, setManual] = useState<Partial<EntryDraft>>(() => (props.areaId ? { areaId: props.areaId } : {}));
  const [kindOverride, setKindOverride] = useState<Kind | undefined>(props.kind);
  const [bManual, setBManual] = useState<Partial<BirthdayDraft>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);


  const parsed = useMemo(() => parseQuick(text), [text]);
  const kind: Kind =
    kindOverride ??
    (props.areaId && parsed.kind !== 'birthday' && !parsed.date
      ? 'task'
      : parsed.kind === 'task' && (props.date || props.time)
        ? 'reminder'
        : parsed.kind);
  const defaultAlert = state.settings.defaultAlert;

  const presetTime = parsed.date ? undefined : props.time;
  const time = parsed.time ?? presetTime;
  const draft: EntryDraft = {
    kind: kind === 'birthday' ? 'reminder' : kind,
    title: parsed.title,
    date: parsed.date ?? props.date,
    time,
    endTime: parsed.endTime,
    repeat: parsed.repeat,
    category: parsed.category,
    alert: time ? (parsed.alert ?? (kind === 'task' ? null : defaultAlert)) : null,
    ...manual,
  };
  if (draft.kind !== 'task' && !draft.date) draft.date = props.date ?? todayISO();

  const bDraft: BirthdayDraft = {
    name: parsed.birthday?.name ?? parsed.title,
    day: parsed.birthday?.day,
    month: parsed.birthday?.month,
    year: parsed.birthday?.year,
    ...bManual,
  };

  const canSave = kind === 'birthday' ? validBirthday(bDraft) : draft.title.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (kind === 'birthday') {
      const id = addBirthday({ name: bDraft.name.trim(), day: bDraft.day!, month: bDraft.month!, year: bDraft.year, notes: bDraft.notes });
      toast(`🎂 Cumpleaños de ${bDraft.name.trim()} guardado`, { action: 'Deshacer', onAction: () => deleteBirthday(id) });
    } else {
      const id = addEntry({ ...draft, title: draft.title.trim(), kind: kind as EntryKind });
      const when = draft.date ? `${formatRelative(draft.date)}${draft.time ? ` · ${draft.time}` : ''}` : 'Sin fecha';
      toast(`Guardado · ${when}`, { action: 'Deshacer', onAction: () => deleteEntry(id) });
    }
    props.onClose();
  };

  const area = props.areaId ? state.areas.find((a) => a.id === props.areaId) : undefined;

  return (
    <Sheet
      open
      onClose={props.onClose}
      title={area ? `Añadir a ${area.emoji} ${area.name}` : 'Añadir'}
      footer={
        <button className="btn block" disabled={!canSave} onClick={save}>
          Guardar
        </button>
      }
    >
      <textarea
        ref={inputRef}
        autoFocus
        className="textarea"
        style={{ minHeight: 56, fontSize: 17 }}
        rows={2}
        placeholder="¿Qué quieres apuntar? Ej.: mañana a las 10 dentista"
        value={text}
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
      />

      {!text.trim() && !props.text ? (
        <div className="mt12">
          <div className="label" style={{ marginBottom: 6 }}>
            Escribe como hablas. Por ejemplo:
          </div>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="chips mt12" style={{ marginBottom: 14 }}>
            {KIND_OPTIONS.map((k) => (
              <button key={k.value} type="button" className={`chip ${kind === k.value ? 'on' : ''}`} onClick={() => setKindOverride(k.value)}>
                {k.emoji} {k.label}
              </button>
            ))}
            <button type="button" className={`chip ${kind === 'birthday' ? 'on' : ''}`} onClick={() => setKindOverride('birthday')}>
              🎂 Cumple
            </button>
          </div>

          {kind === 'birthday' ? (
            <BirthdayFields draft={bDraft} onChange={(p) => setBManual((m) => ({ ...m, ...p }))} />
          ) : (
            <>
              {draft.title && (
                <p className="small muted" style={{ margin: '0 2px 12px' }}>
                  Se guardará como <b style={{ color: 'var(--text)' }}>{draft.title}</b>
                </p>
              )}
              <EntryFields
                draft={draft}
                showKind={false}
                onChange={(p) => setManual((m) => ({ ...m, ...p }))}
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
