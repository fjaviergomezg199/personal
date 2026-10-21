import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Empty, Sheet, toast } from '../components/ui';
import { formatDayMonth, todayISO, toISODate } from '../lib/dates';
import { formatKg, LIFT_LIBRARY, percentTable, platesPerSide, roundTo } from '../lib/lifts';
import { deleteLift, saveLift, updateArea } from '../store/store';
import type { Area, Lift } from '../store/types';

const ROUNDINGS = [0.5, 1, 2.5, 5];

export function LiftsModule({ area }: { area: Area }) {
  const lifts = [...(area.lifts ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const [editing, setEditing] = useState<Lift | 'new' | null>(null);
  const [calc, setCalc] = useState('');
  const rounding = area.rounding ?? 2.5;
  const pct = Number(calc.replace(',', '.'));

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="small muted">
          Apunta tus RM (1 repetición máxima). En los WODs con porcentajes verás los kilos al lado, por ejemplo <b>Peso muerto 5x3 @80%</b> → <span className={`badge tone-${area.color}`}>112,5 kg</span>
        </div>
      </div>

      {lifts.length ? (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="lc-pct">Calculadora rápida</label>
            <input id="lc-pct" className="input" inputMode="decimal" placeholder="Escribe un % (ej. 75)" value={calc} onChange={(e) => setCalc(e.target.value.replace(/[^\d.,]/g, ''))} />
          </div>
          <div className="list">
            {lifts.map((l) => (
              <div key={l.id} className="row tappable" role="button" tabIndex={0} onClick={() => setEditing(l)}>
                <div className="lead" aria-hidden>
                  🏋️
                </div>
                <div className="body">
                  <div className="title">{l.name}</div>
                  <div className="meta">
                    <span>RM {formatKg(l.rm)} kg</span>
                    <span>{formatDayMonth(toISODate(new Date(l.updatedAt)), todayISO())}</span>
                  </div>
                </div>
                {pct > 0 && pct <= 150 ? (
                  <span className={`badge tone-${area.color}`} style={{ fontSize: 'calc(15px * var(--fs))' }}>
                    {formatKg(roundTo((l.rm * pct) / 100, rounding))} kg
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <Empty emoji="💪" title="Sin RM todavía" text="Añade tus marcas: peso muerto, sentadilla, clean, snatch…" />
        </div>
      )}

      <button className="btn secondary block mt16" onClick={() => setEditing('new')}>
        <Plus size={18} /> Añadir RM
      </button>

      <div className="field mt24">
        <span className="label">Redondear pesos a</span>
        <div className="chips">
          {ROUNDINGS.map((r) => (
            <button key={r} className={`chip ${rounding === r ? 'on' : ''}`} onClick={() => updateArea(area.id, { rounding: r })}>
              {formatKg(r)} kg
            </button>
          ))}
        </div>
        <p className="hint">Con discos de 1,25 kg por lado, el salto mínimo es 2,5 kg.</p>
      </div>

      {editing && <LiftSheet area={area} lift={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LiftSheet({ area, lift, onClose }: { area: Area; lift: Lift | null; onClose: () => void }) {
  const [name, setName] = useState(lift?.name ?? '');
  const [rm, setRm] = useState(lift ? String(lift.rm).replace('.', ',') : '');
  const rmNum = Number(rm.replace(',', '.'));
  const rounding = area.rounding ?? 2.5;
  const existingNames = new Set((area.lifts ?? []).map((l) => l.name.toLowerCase()));
  const valid = name.trim().length > 0 && rmNum > 0 && rmNum < 1000;

  const save = () => {
    if (!valid) return;
    saveLift(area.id, { id: lift?.id, name: name.trim(), rm: rmNum });
    toast(lift && lift.rm !== rmNum ? `RM actualizado: ${formatKg(rmNum)} kg 💪` : 'RM guardado');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={lift ? lift.name : 'Nuevo RM'}
      headerExtra={
        lift && (
          <button
            className="icon-btn small"
            aria-label="Borrar"
            onClick={() => {
              deleteLift(area.id, lift.id);
              onClose();
              toast('RM borrado');
            }}
          >
            <Trash2 size={16} />
          </button>
        )
      }
      footer={
        <button className="btn block" onClick={save} disabled={!valid}>
          Guardar
        </button>
      }
    >
      {!lift && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {LIFT_LIBRARY.filter((d) => !existingNames.has(d.name.toLowerCase())).map((d) => (
            <button key={d.key} className={`chip mini ${name === d.name ? 'on' : ''}`} onClick={() => setName(d.name)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="two">
        <div className="field">
          <label htmlFor="lf-name">Ejercicio</label>
          <input id="lf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Peso muerto" />
        </div>
        <div className="field">
          <label htmlFor="lf-rm">RM (kg)</label>
          <input id="lf-rm" className="input" inputMode="decimal" value={rm} onChange={(e) => setRm(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="140" />
        </div>
      </div>

      {rmNum > 0 && (
        <div className="mt16">
          <div className="label" style={{ marginBottom: 8 }}>
            Porcentajes
          </div>
          <div className="pct-table">
            {percentTable(rmNum, rounding).map((r) => {
              const plates = platesPerSide(r.kg);
              return (
                <div key={r.pct} title={plates ? `Por lado: ${plates.map(formatKg).join(' + ')}` : undefined}>
                  <b>{formatKg(r.kg)}</b>
                  <span>{r.pct}%</span>
                </div>
              );
            })}
          </div>
          <p className="hint">
            Discos por lado (barra de 20 kg) para el 80%:{' '}
            {(() => {
              const kg = roundTo(rmNum * 0.8, rounding);
              const plates = platesPerSide(kg);
              return plates ? (plates.length ? plates.map(formatKg).join(' + ') : 'solo la barra') : '—';
            })()}
          </p>
        </div>
      )}

      {lift && lift.history.length > 0 && (
        <div className="mt16">
          <div className="label">Marcas anteriores</div>
          <div className="small muted mt8">
            {[...lift.history]
              .reverse()
              .map((h) => `${formatKg(h.rm)} kg (${formatDayMonth(h.date)})`)
              .join(' · ')}
          </div>
        </div>
      )}
    </Sheet>
  );
}
