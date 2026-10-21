import { ClipboardPaste, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented, Sheet, toast } from '../components/ui';
import { addDays, formatShort, startOfWeek, todayISO, weekdayIndex } from '../lib/dates';
import { copyText } from '../lib/files';
import { parsePlan, planPrompt, type ImportedPlanItem } from '../lib/importers';
import { addPlanItems } from '../store/store';
import type { Area } from '../store/types';

function nextMonday(today: string): string {
  return weekdayIndex(today) === 0 ? today : addDays(startOfWeek(today), 7);
}

export async function pasteFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * Importar un plan: desde Claude (con el mensaje que hay que pedirle) o
 * pegando un texto (p. ej. el WOD copiado de la app del box).
 */
export function ImportPlanSheet(props: { area: Area; mode: 'claude' | 'paste'; initialText?: string; onClose: () => void }) {
  const { area, mode } = props;
  const today = todayISO();
  const isGym = area.template === 'gym';
  const [start, setStart] = useState(mode === 'paste' ? today : nextMonday(today));
  const [text, setText] = useState(props.initialText ?? '');
  const [replace, setReplace] = useState<'add' | 'replace'>('add');

  const kind = area.template === 'studies' ? 'study' : area.template === 'running' ? 'running' : isGym ? 'gym' : 'generic';
  const prompt = planPrompt(area.name, start, kind);

  const parsed = useMemo(() => {
    if (!text.trim()) return { items: [] as ImportedPlanItem[], skipped: 0 };
    const r = parsePlan(text, { start, today, defaultTitle: isGym ? 'Entrenamiento' : 'Sesión', keepBody: isGym });
    if (r.items.length === 0 && mode === 'paste') {
      // Un solo entrenamiento sin fechas: va al día elegido.
      const lines = text.trim().split(/\r?\n/);
      const first = lines.find((l) => l.trim())?.trim() ?? '';
      const title = !isGym && first.length <= 60 ? first : 'Entrenamiento';
      const details = !isGym && first.length <= 60 ? lines.slice(lines.indexOf(first) + 1).join('\n').trim() : text.trim();
      return { items: [{ date: start, title, details: details || undefined }], skipped: 0 };
    }
    return r;
  }, [text, start, today, isGym, mode]);

  const doImport = () => {
    if (!parsed.items.length) return;
    const from = parsed.items[0].date;
    addPlanItems(
      area.id,
      parsed.items.map((i) => ({ date: i.date, title: i.title, details: i.details, time: i.time })),
      replace === 'replace' ? from : undefined,
    );
    toast(parsed.items.length === 1 ? 'Sesión añadida' : `${parsed.items.length} sesiones importadas`);
    props.onClose();
  };

  return (
    <Sheet
      open
      onClose={props.onClose}
      full
      title={mode === 'claude' ? 'Importar desde Claude' : isGym ? 'Pegar entrenamiento' : 'Pegar plan'}
      footer={
        <button className="btn block" disabled={!parsed.items.length} onClick={doImport}>
          {parsed.items.length ? `Importar ${parsed.items.length === 1 ? '1 sesión' : `${parsed.items.length} sesiones`}` : 'Pega primero el texto'}
        </button>
      }
    >
      {mode === 'claude' && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <b>Cómo se hace (1 minuto):</b>
          <ol>
            <li>Elige el día en que empieza el plan.</li>
            <li>
              Copia el mensaje de abajo y pégalo en <b>tu chat de Claude</b> donde preparaste la planificación.
            </li>
            <li>Copia la respuesta de Claude y pégala en el último cuadro.</li>
          </ol>
        </div>
      )}

      <div className="field">
        <label htmlFor="ip-start">{mode === 'claude' ? 'El plan empieza el' : 'Fecha (si el texto no trae fechas)'}</label>
        <input id="ip-start" className="input" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </div>

      {mode === 'claude' && (
        <div className="field">
          <span className="label">Mensaje para Claude</span>
          <div className="code-box prose" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
            {prompt}
          </div>
          <button
            className="btn secondary small"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => toast((await copyText(prompt)) ? 'Mensaje copiado. Pégalo en Claude.' : 'No se pudo copiar')}
          >
            <Copy size={16} /> Copiar mensaje
          </button>
        </div>
      )}

      <div className="field">
        <div className="hstack">
          <label htmlFor="ip-text" className="grow">
            {mode === 'claude' ? 'Respuesta de Claude' : isGym ? 'Entrenamiento (cópialo de la app del box)' : 'Texto del plan'}
          </label>
          <button
            className="link-btn"
            onClick={async () => {
              const t = await pasteFromClipboard();
              if (t) setText(t);
              else toast('Mantén pulsado el cuadro y elige «Pegar»');
            }}
          >
            <ClipboardPaste size={15} style={{ verticalAlign: -2 }} /> Pegar
          </button>
        </div>
        <textarea
          id="ip-text"
          className="textarea tall mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === 'claude'
              ? '[{"fecha": "2026-10-26", "titulo": "…", "detalle": "…"}]'
              : isGym
                ? 'A) Back squat 5x3 @80%\nB) AMRAP 12: 10 thrusters 40/30 kg…'
                : '26/10 | Tema 1 | Leer apuntes'
          }
        />
        <p className="hint">
          {mode === 'claude'
            ? 'También vale texto normal: una sesión por línea con su fecha («26/10 | Rodaje 6 km»), «Lunes: …» o una tabla.'
            : 'Si el texto tiene varios días («Lunes 26/10…»), se crea una sesión por día.'}
        </p>
      </div>

      {parsed.items.length > 0 && (
        <div className="mt16">
          <div className="label" style={{ marginBottom: 6 }}>
            Vista previa · {parsed.items.length} {parsed.items.length === 1 ? 'sesión' : 'sesiones'}
            {parsed.skipped ? ` · ${parsed.skipped} líneas sin fecha ignoradas` : ''}
          </div>
          <div className="list flat">
            {parsed.items.slice(0, 8).map((it, i) => (
              <div className="row no-lead" key={i}>
                <div className="body">
                  <div className="title">{it.title}</div>
                  <div className="meta">
                    <span>{formatShort(it.date)}</span>
                    {it.time && <span>{it.time}</span>}
                    {it.details && <span className="ellipsis">{it.details.split('\n')[0]}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {parsed.items.length > 8 && <p className="hint">…y {parsed.items.length - 8} más</p>}
          {mode === 'claude' && (
            <div className="mt12">
              <Segmented
                value={replace}
                onChange={setReplace}
                options={[
                  { value: 'add', label: 'Añadir al plan' },
                  { value: 'replace', label: 'Sustituir desde esa fecha' },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
