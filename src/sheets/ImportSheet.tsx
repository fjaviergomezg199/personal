import { Copy, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBadge } from '../components/AgendaRow';
import { CategoryPicker, nextColor } from '../components/CategoryPicker';
import { Segmented, Sheet, toast } from '../components/ui';
import { importPrompt, parsePlan } from '../lib/calendarImport';
import { addDays, capitalize, formatDayMonth, formatShort, todayISO, weekdayIndex } from '../lib/dates';
import { copyText } from '../lib/files';
import { fold } from '../lib/quickParse';
import { addCategory, findCategory, getState, importEntries, undoImport, useApp, type EntryInput } from '../store/store';
import type { EntryKind, ID } from '../store/types';

const PREVIEW = 40;

/** El próximo lunes (o hoy si es lunes): donde empieza un plan con «Semana 1» o «Día 1». */
const nextMonday = (today: string) => (weekdayIndex(today) === 0 ? today : addDays(today, 7 - weekdayIndex(today)));

/**
 * Importar al calendario un JSON (o una lista o tabla de texto): un plan de
 * running, de estudio… Cada cosa va a su día, con su categoría y su color.
 */
export function ImportSheet({ text: initialText, onClose }: { text?: string; onClose: () => void }) {
  const state = useApp();
  const today = todayISO();
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [text, setText] = useState(initialText ?? '');
  const [fileName, setFileName] = useState('');
  const [start, setStart] = useState(() => nextMonday(today));
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [kind, setKind] = useState<EntryKind>('task');

  const parsed = useMemo(() => (text.trim() ? parsePlan(text, { start, today }) : { items: [], skipped: 0 }), [text, start, today]);
  const items = parsed.items;
  // Las categorías que trae el propio archivo (se crean si no existen)
  const fileCats = [...new Map(items.filter((i) => i.category).map((i) => [fold(i.category!), i.category!])).values()];
  const relative = /\b(d[ií]a|semana|week|day)\s*\d|\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(text);
  const chosen = categoryId ? state.categories.find((c) => c.id === categoryId) : undefined;

  const catFor = (name?: string) => (name ? findCategory(state, name) : chosen);

  const run = () => {
    if (!items.length) return;
    const ids = new Map<string, ID>();
    for (const name of fileCats) {
      const s = getState();
      ids.set(fold(name), findCategory(s, name)?.id ?? addCategory(name, nextColor(s.categories)));
    }
    const inputs: EntryInput[] = items.map((i) => ({
      kind: i.kind ?? kind,
      title: i.title,
      ...(i.details ? { notes: i.details } : {}),
      date: i.date,
      ...(i.time ? { time: i.time } : {}),
      ...(i.endTime ? { endTime: i.endTime } : {}),
      ...(i.location ? { location: i.location } : {}),
      repeat: 'none',
      alert: null,
      categoryId: i.category ? ids.get(fold(i.category)) : categoryId,
    }));
    const name = fileName || fileCats[0] || chosen?.name || `Importación del ${formatDayMonth(today)}`;
    const { batchId } = importEntries(name, inputs);
    const first = items[0].date;
    toast(`${inputs.length} ${inputs.length === 1 ? 'cosa' : 'cosas'} en el calendario, desde el ${formatDayMonth(first)}`, {
      action: 'Deshacer',
      onAction: () => undoImport(batchId),
      duration: 8000,
    });
    onClose();
  };

  return (
    <Sheet
      open
      full
      onClose={onClose}
      title="Importar al calendario"
      footer={
        <button className="btn block" disabled={!items.length} onClick={run}>
          {items.length ? `Importar ${items.length} al calendario` : 'Importar'}
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Un plan de entrenos, de estudio o cualquier calendario en JSON (o en lista o tabla de texto). Cada cosa va a su día, con su categoría y su color.
      </p>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'paste', label: 'Pegar' },
          { value: 'file', label: 'Archivo' },
        ]}
      />
      <div className="mt12">
        {mode === 'paste' ? (
          <textarea
            className="textarea mono"
            style={{ minHeight: 120 }}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName('');
            }}
            placeholder={'[\n  {"fecha": "2026-11-02", "hora": "19:00", "titulo": "Rodaje suave 6 km", "categoria": "Running"}\n]'}
            aria-label="JSON o texto para importar"
          />
        ) : (
          <label className="btn secondary block">
            <FileUp size={18} /> {fileName || 'Elegir archivo (.json, .txt, .csv)'}
            <input
              type="file"
              accept=".json,.txt,.md,.csv,application/json,text/plain,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setText(await f.text());
                setFileName(f.name.replace(/\.[a-z0-9]+$/i, ''));
              }}
            />
          </label>
        )}
      </div>

      {relative && (
        <div className="field mt12">
          <label htmlFor="imp-start">Empieza el (para «Día 1», «Semana 1», «lunes»…)</label>
          <input id="imp-start" className="input" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </div>
      )}

      {text.trim() !== '' && !items.length && (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          No encuentro fechas. Cada cosa necesita su «fecha» (AAAA-MM-DD), o «Día 1», «Semana 2 martes»…
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="mt16">
            {fileCats.length > 0 ? (
              <p className="small" style={{ margin: '0 0 6px' }}>
                Cada cosa con la categoría que trae: <b>{fileCats.join(', ')}</b>
                {fileCats.some((n) => !findCategory(state, n)) ? ' (las que no tienes se crean).' : '.'}
                {items.some((i) => !i.category) ? ' Las que no traen ninguna:' : ''}
              </p>
            ) : null}
            {(!fileCats.length || items.some((i) => !i.category)) && <CategoryPicker value={categoryId} onChange={setCategoryId} />}
          </div>
          {items.some((i) => !i.kind) && (
            <div className="field">
              <span className="label">Cada cosa es</span>
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'task', label: '✅ Tarea (se marca hecha)' },
                  { value: 'event', label: '📅 Plan' },
                ]}
              />
            </div>
          )}
          <div className="label mt12">
            {items.length} {items.length === 1 ? 'cosa' : 'cosas'}, del {formatDayMonth(items[0].date)} al {formatDayMonth(items.at(-1)!.date)}
            {parsed.skipped ? ` · ${parsed.skipped} ${parsed.skipped === 1 ? 'línea' : 'líneas'} sin fecha no se importan` : ''}
          </div>
          <div className="list mt8 import-preview">
            {items.slice(0, PREVIEW).map((i, k) => {
              const cat = catFor(i.category);
              return (
                <div key={k} className={`row ${cat ? `has-cat tone-${cat.color}` : ''}`}>
                  <div className="time">{i.time ?? ''}</div>
                  <div className="body">
                    <div className="title">{i.title}</div>
                    <div className="meta">
                      <span>{capitalize(formatShort(i.date))}</span>
                      {i.endTime && <span>hasta {i.endTime}</span>}
                      {cat ? <CategoryBadge category={cat} /> : i.category ? <span>● {i.category} (nueva)</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > PREVIEW && <p className="hint center">… y {items.length - PREVIEW} más</p>}
        </>
      )}

      <div className="callout mt16">
        <b>¿No tienes el JSON?</b> Pídeselo a ChatGPT o a Claude: copia estas instrucciones, pégalas en la conversación donde preparasteis el plan y pega aquí lo que te
        conteste.
        <button
          className="btn secondary small mt8"
          onClick={async () => toast((await copyText(importPrompt(start, chosen?.name ?? 'Running'))) ? 'Instrucciones copiadas' : 'No se pudieron copiar')}
        >
          <Copy size={16} /> Copiar instrucciones
        </button>
      </div>
    </Sheet>
  );
}
