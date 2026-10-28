import { Check, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { nextColor } from '../components/CategoryPicker';
import { toast } from '../components/ui';
import { importBackup } from '../lib/backup';
import { fold } from '../lib/quickParse';
import { startDriveRestore } from '../lib/syncRunner';
import { addCategory, getState, updateSettings } from '../store/store';
import type { ColorKey } from '../store/types';
import { InstallCard } from './Install';

/** Ideas para empezar (se puede escribir cualquier otra). */
const SUGGESTED: { name: string; emoji: string; color: ColorKey }[] = [
  { name: 'Trabajo', emoji: '💼', color: 'blue' },
  { name: 'Personal', emoji: '🙂', color: 'violet' },
  { name: 'Deporte', emoji: '🏃', color: 'orange' },
  { name: 'Estudios', emoji: '📚', color: 'teal' },
  { name: 'Casa', emoji: '🏠', color: 'amber' },
  { name: 'Salud', emoji: '🩺', color: 'green' },
  { name: 'Familia', emoji: '❤️', color: 'rose' },
  { name: 'Planes', emoji: '🎉', color: 'pink' },
];

interface Pick {
  name: string;
  emoji?: string;
  color: ColorKey;
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [custom, setCustom] = useState('');
  const restoreInput = useRef<HTMLInputElement>(null);

  const has = (n: string) => picks.some((p) => fold(p.name) === fold(n));
  const toggle = (s: Pick) => setPicks(has(s.name) ? picks.filter((p) => fold(p.name) !== fold(s.name)) : [...picks, s]);
  const addCustom = () => {
    const n = custom.trim();
    if (!n || has(n)) return setCustom('');
    // Un color que aún no esté elegido
    setPicks([...picks, { name: n, color: nextColor(picks) }]);
    setCustom('');
  };

  const finish = () => {
    for (const p of picks) addCategory(p.name, p.color, p.emoji);
    updateSettings({ name: name.trim(), onboarded: true });
    location.hash = '#/hoy';
  };

  return (
    <div className="onboard">
      <div className="steps" aria-label={`Paso ${step + 1} de 3`}>
        {[0, 1, 2].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <>
          <img src="icons/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 18, marginTop: 28 }} />
          <h1>Hola 👋 Esto es Día a Día</h1>
          <p className="lead">Tu agenda: el día, la semana y el mes de un vistazo, cada cosa del color de su categoría. Y tus hábitos.</p>
          <div className="field">
            <label htmlFor="ob-name">¿Cómo te llamas?</label>
            <input
              id="ob-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              autoComplete="given-name"
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(1)}
            />
          </div>
          <div className="foot">
            <button className="btn block" disabled={!name.trim()} onClick={() => setStep(1)}>
              Siguiente
            </button>
            {getState().settings.google.clientId && (
              <button className="btn ghost block mt8" onClick={startDriveRestore}>
                Recuperar mi copia de Google Drive
              </button>
            )}
            <button className="btn ghost block mt8" onClick={() => restoreInput.current?.click()}>
              Tengo una copia de seguridad
            </button>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const r = await importBackup(f);
                  toast(`Copia restaurada: ${r.entries} cosas en el calendario y ${r.categories} categorías`);
                  location.hash = '#/hoy';
                } catch (err) {
                  toast((err as Error).message);
                }
              }}
            />
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Tus categorías</h1>
          <p className="lead">Cada cosa que apuntes puede llevar una, y sale de su color en el calendario. Elige algunas o escribe las tuyas (luego se pueden cambiar).</p>
          <div className="chips">
            {SUGGESTED.map((s) => {
              const on = has(s.name);
              return (
                <button key={s.name} className={`chip cat-chip tone-${s.color} ${on ? 'sel' : ''}`} aria-pressed={on} onClick={() => toggle(s)}>
                  <i aria-hidden />
                  {s.emoji} {s.name}
                  {on && <Check size={14} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          {picks.filter((p) => !SUGGESTED.some((s) => fold(s.name) === fold(p.name))).length > 0 && (
            <div className="chips mt12">
              {picks
                .filter((p) => !SUGGESTED.some((s) => fold(s.name) === fold(p.name)))
                .map((p) => (
                  <button key={p.name} className={`chip cat-chip sel tone-${p.color}`} onClick={() => toggle(p)} aria-label={`Quitar ${p.name}`}>
                    <i aria-hidden />
                    {p.name} <X size={14} />
                  </button>
                ))}
            </div>
          )}
          <div className="hstack mt16">
            <input
              className="input"
              value={custom}
              maxLength={40}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="Otra: 2Sigma, Running, Inglés…"
              aria-label="Otra categoría"
            />
            <button className="btn secondary" disabled={!custom.trim()} onClick={addCustom} aria-label="Añadir categoría">
              <Plus size={18} />
            </button>
          </div>
          <div className="foot btn-row">
            <button className="btn secondary" onClick={() => setStep(0)}>
              Atrás
            </button>
            <button className="btn" onClick={() => setStep(2)}>
              {picks.length ? 'Siguiente' : 'Ahora no'}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>¡Listo, {name.trim()}!</h1>
          <p className="lead">Cuatro trucos:</p>
          <div className="stack">
            <div className="card">
              <b>➕ Apunta como hablas.</b> Pulsa + y escribe «mañana a las 10 dentista». Con «#» eliges la categoría: «#running rodaje jueves 19:00».
            </div>
            <div className="card">
              <b>🗓️ Mes, semana o día.</b> En Calendario lo ves todo de colores; desliza a los lados para cambiar.
            </div>
            <div className="card">
              <b>📥 Importa tus planes.</b> Un plan de entrenos o de estudio en JSON (te lo puede hacer ChatGPT o Claude) va al calendario de una vez: Ajustes → Importar.
            </div>
            <div className="card">
              <b>🔔 Avisos de verdad.</b> En Ajustes conecta Google Calendar: lo que apuntes irá allí con su aviso.
            </div>
          </div>
          <InstallCard />
          <div className="foot btn-row">
            <button className="btn secondary" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button className="btn" onClick={finish}>
              Empezar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
