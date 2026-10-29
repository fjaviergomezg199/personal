import { Mic } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { nextColor } from '../components/CategoryPicker';
import { Sheet, toast } from '../components/ui';
import { formatRelative, todayISO } from '../lib/dates';
import { canDictate, cancelDictation, DICTATION_HELP, startDictation, stopDictation, useDictation } from '../lib/dictation';
import { parseQuick, splitHashtag } from '../lib/quickParse';
import { addBirthday, addCategory, addEntry, deleteBirthday, deleteEntry, findCategory, useApp } from '../store/store';
import type { EntryKind, HHMM, ID, ISODate } from '../store/types';
import { BirthdayFields, validBirthday, type BirthdayDraft } from './BirthdayFields';
import { EntryFields, KIND_OPTIONS, type EntryDraft } from './EntryForm';

type Kind = EntryKind | 'birthday';

export function QuickAddSheet(props: {
  onClose: () => void;
  date?: ISODate;
  time?: HHMM;
  categoryId?: ID;
  kind?: Kind;
  text?: string;
  /** Se abre ya escuchando: la vez que empezó el micrófono de Hoy. */
  dictation?: number;
}) {
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
    endDate: parsed.endDate,
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

  // El cuadro crece con lo que se escribe (de 1 a 4 líneas): con el teclado abierto cada línea cuenta
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight + t.offsetHeight - t.clientHeight, 132)}px`;
  }, [text]);

  // Dictar: lo que se dice se va escribiendo detrás de lo que ya hubiera
  const dict = useDictation();
  const mine = useRef(props.dictation);
  const before = useRef(props.text?.trim() ?? '');
  const listening = dict.listening && dict.session === mine.current;
  useEffect(() => {
    if (dict.session !== mine.current || !dict.text) return;
    setText(before.current ? `${before.current} ${dict.text}` : dict.text);
  }, [dict.session, dict.text]);
  useEffect(() => {
    if (dict.session !== mine.current || !dict.error) return;
    toast(DICTATION_HELP[dict.error], { duration: 6000 });
    if (dict.error !== 'silence') box.current?.focus();
  }, [dict.session, dict.error]);
  useEffect(() => () => cancelDictation(), []);

  const toggleMic = () => {
    if (listening) return stopDictation();
    before.current = text.trim();
    mine.current = startDictation();
    box.current?.blur(); // sin teclado se ve todo lo que se va entendiendo (si falla, el aviso lo vuelve a abrir)
  };

  const save = () => {
    if (!canSave) return;
    if (kind === 'birthday') {
      const id = addBirthday({ name: bDraft.name.trim(), day: bDraft.day!, month: bDraft.month!, year: bDraft.year, notes: bDraft.notes });
      toast(`🎂 Cumpleaños de ${bDraft.name.trim()} guardado`, { action: 'Deshacer', onAction: () => deleteBirthday(id) });
    } else {
      const categoryId = pending ? addCategory(pending.name, pending.color) : draft.categoryId;
      const id = addEntry({ ...draft, categoryId, title: draft.title.trim(), kind: kind as EntryKind });
      const when = draft.date ? `Guardado · ${formatRelative(draft.date)}${draft.time ? ` · ${draft.time}` : ''}` : '📌 Guardado en Pendientes';
      toast(when, { action: 'Deshacer', onAction: () => deleteEntry(id) });
    }
    props.onClose();
  };

  return (
    <Sheet
      open
      onClose={props.onClose}
      title={props.date && props.date !== todayISO() ? `Añadir · ${formatRelative(props.date)}${props.time ? ` ${props.time}` : ''}` : 'Añadir'}
      // Guardar arriba (como en el Calendario del iPhone): así el teclado deja sitio para todo lo demás
      headerExtra={
        <button className="btn small" disabled={!canSave} onClick={save}>
          Guardar
        </button>
      }
    >
      <div className="quick-input">
        <textarea
          ref={box}
          autoFocus={props.dictation === undefined}
          className="textarea"
          style={{ minHeight: 48, fontSize: 'calc(17px * var(--fs))', resize: 'none' }}
          rows={1}
          placeholder={listening ? 'Te escucho…' : '¿Qué quieres apuntar?'}
          value={text}
          enterKeyHint="done"
          onChange={(e) => {
            if (listening) cancelDictation(); // si se escribe a mano, manda lo escrito
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        />
        {(listening || canDictate()) && (
          <button type="button" className={`mic-btn ${listening ? 'on' : ''}`} aria-label={listening ? 'Parar de dictar' : 'Dictar'} aria-pressed={listening} onClick={toggleMic}>
            <Mic size={22} />
          </button>
        )}
      </div>

      {!text.trim() && !props.text ? (
        <p className="hint mt8">Por ejemplo: «#2sigma reunión mañana a las 10»</p>
      ) : (
        <>
          <div className="chips scroll mt8" style={{ marginBottom: 10 }} role="group" aria-label="Qué es">
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
                <p className="small muted" style={{ margin: '0 2px 10px' }}>
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
