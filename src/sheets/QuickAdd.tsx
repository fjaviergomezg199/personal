import { useMemo, useState } from 'react';
import { nextColor } from '../components/CategoryPicker';
import { Sheet, toast } from '../components/ui';
import { formatRelative, todayISO } from '../lib/dates';
import { parseQuick, splitHashtag } from '../lib/quickParse';
import { addBirthday, addCategory, addEntry, deleteBirthday, deleteEntry, findCategory, useApp } from '../store/store';
import type { EntryKind, HHMM, ID, ISODate } from '../store/types';
import { BirthdayFields, validBirthday, type BirthdayDraft } from './BirthdayFields';
import { EntryFields, KIND_OPTIONS, type EntryDraft } from './EntryForm';

const EXAMPLES = [
  'mañana a las 10 dentista',
  '#2sigma reunión el lunes a las 9',
  '#running rodaje 6 km jueves 19:00',
  'cumple de Marta 12/03',
  'todos los lunes 9:00 clase de inglés',
  'llamar al banco',
];

type Kind = EntryKind | 'birthday';

export function QuickAddSheet(props: { onClose: () => void; date?: ISODate; time?: HHMM; categoryId?: ID; kind?: Kind; text?: string }) {
  const state = useApp();
  const [text, setText] = useState(props.text ?? '');
  // Lo que se toca a mano manda; la fecha/hora con la que se abrió es solo el valor por defecto.
  const [manual, setManual] = useState<Partial<EntryDraft>>(() => (props.categoryId ? { categoryId: props.categoryId } : {}));
  const [kindOverride, setKindOverride] = useState<Kind | undefined>(props.kind);
  const [bManual, setBManual] = useState<Partial<BirthdayDraft>>({});
  const [dropTag, setDropTag] = useState(false);

  const { tag, rest } = useMemo(() => splitHashtag(text), [text]);
  const parsed = useMemo(() => parseQuick(rest), [rest]);
  const tagged = tag ? findCategory(state, tag) : undefined;
  // «#algo» que aún no existe: se crea al guardar (salvo que se elija otra)
  const pending = tag && !tagged && !dropTag && !('categoryId' in manual) ? { name: tag, color: nextColor(state.categories) } : null;

  const kind: Kind = kindOverride ?? (parsed.kind === 'task' && (props.date || props.time) ? 'reminder' : parsed.kind);
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
    alert: time ? (parsed.alert ?? (kind === 'task' ? null : defaultAlert)) : null,
    categoryId: tagged?.id,
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
      const categoryId = pending ? addCategory(pending.name, pending.color) : draft.categoryId;
      const id = addEntry({ ...draft, categoryId, title: draft.title.trim(), kind: kind as EntryKind });
      const when = draft.date ? `${formatRelative(draft.date)}${draft.time ? ` · ${draft.time}` : ''}` : 'Sin fecha';
      toast(`Guardado · ${when}`, { action: 'Deshacer', onAction: () => deleteEntry(id) });
    }
    props.onClose();
  };

  return (
    <Sheet
      open
      onClose={props.onClose}
      title={props.date && props.date !== todayISO() ? `Añadir · ${formatRelative(props.date)}${props.time ? ` ${props.time}` : ''}` : 'Añadir'}
      footer={
        <button className="btn block" disabled={!canSave} onClick={save}>
          Guardar
        </button>
      }
    >
      <textarea
        autoFocus
        className="textarea"
        style={{ minHeight: 56, fontSize: 'calc(17px * var(--fs))' }}
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
            Escribe como hablas. Con «#» eliges la categoría:
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
          <div className="chips scroll mt12" style={{ marginBottom: 12 }} role="group" aria-label="Qué es">
            {KIND_OPTIONS.map((k) => (
              <button key={k.value} type="button" className={`chip mini ${kind === k.value ? 'on' : ''}`} onClick={() => setKindOverride(k.value)}>
                {k.emoji} {k.label}
              </button>
            ))}
            <button type="button" className={`chip mini ${kind === 'birthday' ? 'on' : ''}`} onClick={() => setKindOverride('birthday')}>
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
                pendingCategory={pending}
                onDropPendingCategory={() => setDropTag(true)}
                onChange={(p) => setManual((m) => ({ ...m, ...p }))}
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
