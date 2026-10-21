import { ClipboardPaste, FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Check, Segmented, Sheet, toast } from '../components/ui';
import { detectColumns, parseDelimited, readBankFile, toImportRows, type Columns, type ImportRow, type Table } from '../lib/bankImport';
import { capitalize, formatShort } from '../lib/dates';
import { categoriesFor, categoryOf, eur } from '../lib/finance';
import { pasteFromClipboard } from '../modules/ImportPlanSheet';
import { addMovements, deleteMovements, useApp } from '../store/store';
import type { FinScope } from '../store/types';

const colName = (i: number) => String.fromCharCode(65 + i);

/** Importar los movimientos que da el banco (Excel, CSV o filas pegadas). */
export function BankImportSheet({ scope: initialScope, onClose }: { scope: FinScope; onClose: () => void }) {
  const state = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [cols, setCols] = useState<Columns | null>(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [scope, setScope] = useState<FinScope>(initialScope);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [cats, setCats] = useState<Record<string, string>>({});

  const existing = useMemo(() => state.finance.movements.filter((m) => m.scope === scope), [state.finance.movements, scope]);
  const rows = useMemo(() => (table && cols ? toImportRows(table, cols, existing) : []), [table, cols, existing]);
  const on = (r: ImportRow) => picked[r.key] ?? !r.duplicate;
  const chosen = rows.filter(on);
  const spent = chosen.filter((r) => r.kind === 'gasto').reduce((t, r) => t + r.amount, 0);

  const load = (t: Table) => {
    if (!t.length) {
      setError('No he encontrado filas.');
      return;
    }
    setTable(t);
    setPicked({});
    setCats({});
    const c = detectColumns(t);
    setCols(c);
    setError(c ? '' : 'No sé qué columna es cada cosa: elígelas abajo.');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      load(await readBankFile(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el fichero.');
    }
  };

  const doImport = () => {
    if (!chosen.length) return;
    const ids = addMovements(chosen.map((r) => ({ scope, kind: r.kind, date: r.date, amount: r.amount, category: cats[r.key] ?? r.category, note: r.note || undefined })));
    toast(`${ids.length} ${ids.length === 1 ? 'movimiento importado' : 'movimientos importados'}`, { action: 'Deshacer', onAction: () => deleteMovements(ids) });
    onClose();
  };

  const width = table ? Math.max(...table.slice(0, 30).map((r) => r.length)) : 0;
  const colSelect = (label: string, key: 'date' | 'concept' | 'amount') => (
    <div className="field">
      <label>{label}</label>
      <select
        className="select"
        value={cols?.[key] ?? ''}
        onChange={(e) => {
          const v = Number(e.target.value);
          const base: Columns = cols ?? { header: -1, date: 0, concept: 1, amount: 2 };
          const next: Columns = { ...base, [key]: v };
          if (key === 'amount') {
            delete next.debit;
            delete next.credit;
          }
          setCols(next);
          setError('');
        }}
      >
        <option value="" disabled>
          Elige
        </option>
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            Columna {colName(i)}
            {table?.[Math.max(0, cols?.header ?? 0)]?.[i] ? ` · ${table[Math.max(0, cols?.header ?? 0)][i].slice(0, 20)}` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title="Importar del banco"
      footer={
        table ? (
          <button className="btn block" disabled={!chosen.length} onClick={doImport}>
            {chosen.length ? `Importar ${chosen.length} · ${eur(spent, true)} de gastos` : 'Marca lo que quieras importar'}
          </button>
        ) : undefined
      }
    >
      {!table ? (
        <>
          <div className="callout">
            <b>Cómo sacar los movimientos del banco</b>
            <ol>
              <li>En la web o la app del banco, entra en los movimientos de la cuenta.</li>
              <li>
                Busca <b>Descargar</b> o <b>Exportar</b> y elige <b>Excel</b> o <b>CSV</b> (las fechas que quieras).
              </li>
              <li>Ábrelo aquí. También puedes copiar las filas (en Excel o en la web) y pegarlas abajo.</li>
            </ol>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button className="btn block mt16" onClick={() => fileRef.current?.click()}>
            <FileUp size={18} /> Elegir fichero (.xlsx o .csv)
          </button>
          <div className="field mt16">
            <div className="hstack">
              <label htmlFor="bi-paste" className="grow">
                O pega las filas
              </label>
              <button
                className="link-btn"
                onClick={async () => {
                  const t = await pasteFromClipboard();
                  if (t) setPaste(t);
                  else toast('Mantén pulsado el cuadro y elige «Pegar»');
                }}
              >
                <ClipboardPaste size={15} style={{ verticalAlign: -2 }} /> Pegar
              </button>
            </div>
            <textarea id="bi-paste" className="textarea mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'21/10/2026  MERCADONA  -45,30\n20/10/2026  NÓMINA  2.100,00'} />
            <button className="btn secondary" disabled={!paste.trim()} onClick={() => load(parseDelimited(paste))}>
              Leer
            </button>
          </div>
          {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
        </>
      ) : (
        <>
          <div className="field">
            <span className="label">¿A qué cuenta van?</span>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'personal', label: '💶 Mía' },
                { value: 'hogar', label: '🤝 Conjunta' },
              ]}
            />
          </div>
          {error && <p className="hint" style={{ color: 'var(--warning)' }}>{error}</p>}
          {(!cols || error) && (
            <div className="two mt12" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {colSelect('Fecha', 'date')}
              {colSelect('Concepto', 'concept')}
              {colSelect('Importe', 'amount')}
            </div>
          )}
          {cols && !error && (
            <p className="small muted">
              {rows.length} movimientos encontrados
              {(() => {
                const d = rows.filter((r) => r.duplicate).length;
                return d ? `; ${d === 1 ? '1 ya estaba apuntado (desmarcado)' : `${d} ya estaban apuntados (desmarcados)`}` : '';
              })()}
              .{' '}
              <button className="link-btn small" style={{ padding: 0 }} onClick={() => setError('Elige qué columna es cada cosa.')}>
                Cambiar columnas
              </button>
            </p>
          )}
          {rows.length > 0 && (
            <div className="list flat mt8">
              {rows.map((r) => {
                const cat = cats[r.key] ?? r.category;
                return (
                  <div key={r.key} className={`row ${on(r) ? '' : 'done'}`}>
                    <div className="lead">
                      <Check on={on(r)} onChange={() => setPicked({ ...picked, [r.key]: !on(r) })} square label={on(r) ? 'No importar' : 'Importar'} />
                    </div>
                    <div className="body">
                      <div className="title" style={{ textDecoration: 'none' }}>
                        {r.note || categoryOf(cat).label}
                      </div>
                      <div className="meta">
                        <span>{capitalize(formatShort(r.date))}</span>
                        {r.duplicate && <span>ya apuntado</span>}
                      </div>
                      <select className="select mini-select" value={cat} onChange={(e) => setCats({ ...cats, [r.key]: e.target.value })} aria-label="Categoría">
                        {categoriesFor(r.kind).map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.emoji} {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={`mv-amount ${r.kind}`}>
                      {r.kind === 'ingreso' ? '+' : '−'}
                      {eur(r.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="btn ghost block mt12" onClick={() => setTable(null)}>
            Elegir otro fichero
          </button>
        </>
      )}
    </Sheet>
  );
}
