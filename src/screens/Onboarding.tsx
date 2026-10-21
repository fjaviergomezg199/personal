import { Check, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from '../components/ui';
import { importBackup } from '../lib/backup';
import { addArea, updateSettings } from '../store/store';
import { TEMPLATES } from '../store/templates';
import type { TemplateKey } from '../store/types';
import { InstallCard } from './Install';

interface Pick {
  uid: number;
  key: TemplateKey;
  name: string;
}

const STARTERS: TemplateKey[] = ['studies', 'running', 'gym', 'nutrition', 'work', 'home'];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [seq, setSeq] = useState(1);
  const restoreInput = useRef<HTMLInputElement>(null);

  const toggle = (key: TemplateKey) => {
    const has = picks.some((p) => p.key === key);
    if (has) setPicks(picks.filter((p) => p.key !== key));
    else {
      const t = TEMPLATES.find((x) => x.key === key)!;
      setPicks([...picks, { uid: seq, key, name: key === 'work' ? '' : t.name }]);
      setSeq(seq + 1);
    }
  };

  const addWork = () => {
    setPicks([...picks, { uid: seq, key: 'work', name: '' }]);
    setSeq(seq + 1);
  };

  const finish = () => {
    for (const p of picks) {
      const t = TEMPLATES.find((x) => x.key === p.key)!;
      addArea(p.key, { name: p.name.trim() || t.name });
    }
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
          <p className="lead">Tu agenda, recordatorios, cumpleaños y todo lo tuyo —estudios, deporte, nutrición, trabajo— en un solo sitio y muy fácil.</p>
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
                  toast(`Copia restaurada: ${r.areas} áreas y ${r.entries} elementos`);
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
          <h1>¿Qué quieres organizar?</h1>
          <p className="lead">Elige tus áreas. Podrás añadir más (o quitarlas) cuando quieras.</p>
          <div className="stack">
            {STARTERS.map((key) => {
              const t = TEMPLATES.find((x) => x.key === key)!;
              const mine = picks.filter((p) => p.key === key);
              const on = mine.length > 0;
              return (
                <div key={key}>
                  <button className={`template-card tone-${t.color} ${on ? 'on' : ''}`} onClick={() => toggle(key)} aria-pressed={on}>
                    <div className="em" aria-hidden>
                      {t.emoji}
                    </div>
                    <div className="grow">
                      <div className="t">{t.name}</div>
                      <div className="d">{t.description}</div>
                    </div>
                    <span className={`check ${on ? 'on' : ''} tone-${t.color}`} aria-hidden>
                      <Check size={16} strokeWidth={3.2} />
                    </span>
                  </button>
                  {on &&
                    mine.map((p, i) => (
                      <div key={p.uid} className="hstack" style={{ margin: '8px 0 0 12px' }}>
                        <input
                          className="input"
                          value={p.name}
                          placeholder={key === 'work' ? (i === 0 ? 'Nombre: p. ej. Academia' : 'Nombre: p. ej. Ministerio') : t.name}
                          aria-label={`Nombre del área ${t.name}`}
                          onChange={(e) => setPicks(picks.map((x) => (x.uid === p.uid ? { ...x, name: e.target.value } : x)))}
                        />
                        {key === 'work' && mine.length > 1 && (
                          <button className="icon-btn small plain" aria-label="Quitar" onClick={() => setPicks(picks.filter((x) => x.uid !== p.uid))}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  {key === 'work' && on && (
                    <button className="link-btn" style={{ margin: '6px 0 0 12px' }} onClick={addWork}>
                      <Plus size={15} style={{ verticalAlign: -2 }} /> Añadir otro trabajo
                    </button>
                  )}
                </div>
              );
            })}
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
          <p className="lead">Tres trucos para sacarle partido:</p>
          <div className="stack">
            <div className="card">
              <b>➕ Apunta como hablas.</b> Pulsa el botón + y escribe «mañana a las 10 dentista» o «cumple de Marta 12/03». La app entiende la fecha y la hora.
            </div>
            <div className="card">
              <b>🗓️ Tus planes de Claude, día a día.</b> En cada área, «Importar de Claude» te da el mensaje para que Claude te pase la planificación y la verás en Hoy.
            </div>
            <div className="card">
              <b>🔔 Avisos de verdad.</b> En Ajustes conecta Google Calendar: tus recordatorios irán allí con su aviso.
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
