import { ArrowDown, ArrowUp, Check, LayoutList } from 'lucide-react';
import { useState } from 'react';
import { Segmented, Sheet } from '../components/ui';
import { resolveLayout, TODAY_SECTIONS } from '../lib/todayLayout';
import { updateSettings, useApp } from '../store/store';
import type { Accent, Backdrop, Settings, TextSize } from '../store/types';

/** Colores de muestra (los mismos que usa la app en modo claro). */
const ACCENTS: { key: Accent; label: string; color: string }[] = [
  { key: 'violet', label: 'Violeta', color: '#5b4fd6' },
  { key: 'blue', label: 'Azul', color: '#1f62c4' },
  { key: 'teal', label: 'Turquesa', color: '#0a7268' },
  { key: 'green', label: 'Verde', color: '#2b7a3d' },
  { key: 'amber', label: 'Mostaza', color: '#8f5f00' },
  { key: 'orange', label: 'Naranja', color: '#bd4310' },
  { key: 'rose', label: 'Rojo', color: '#c0294b' },
  { key: 'pink', label: 'Rosa', color: '#ab2c7b' },
  { key: 'slate', label: 'Gris', color: '#4a5568' },
];

const BACKDROPS: { key: Backdrop; label: string; swatch: string }[] = [
  { key: 'warm', label: 'Cálido', swatch: '#f5f3ee' },
  { key: 'neutral', label: 'Neutro', swatch: '#f4f4f5' },
  { key: 'cool', label: 'Frío', swatch: '#f1f4f8' },
  { key: 'tinted', label: 'Del color', swatch: 'color-mix(in srgb, var(--primary) 14%, #f7f6f3)' },
];

const EMOJIS = ['👋', '🌞', '✨', '💪', '🌸', '🦋', '🌿', '☕', '🎨', '🐻', '🏃', '📚'];

/** Tema, color principal, fondo, letra y saludo: cada uno a su gusto. */
export function AppearanceCard() {
  const state = useApp();
  const s = state.settings;
  const [layoutOpen, setLayoutOpen] = useState(false);
  const accent = s.accent ?? 'violet';
  const backdrop = s.backdrop ?? 'warm';

  return (
    <div className="card">
      <span className="label">Modo</span>
      <div className="mt8">
        <Segmented<Settings['theme']>
          value={s.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'auto', label: 'Automático' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </div>

      <div className="label mt16">Color</div>
      <div className="swatches mt8">
        {ACCENTS.map((a) => (
          <button
            key={a.key}
            className={`swatch ${accent === a.key ? 'on' : ''}`}
            style={{ background: a.color }}
            onClick={() => updateSettings({ accent: a.key })}
            aria-label={a.label}
            aria-pressed={accent === a.key}
          >
            {accent === a.key && <Check size={18} strokeWidth={3} />}
          </button>
        ))}
      </div>

      <div className="label mt16">Fondo</div>
      <div className="backdrops mt8">
        {BACKDROPS.map((b) => (
          <button key={b.key} className={`backdrop-opt ${backdrop === b.key ? 'on' : ''}`} onClick={() => updateSettings({ backdrop: b.key })} aria-pressed={backdrop === b.key}>
            <i style={{ background: b.swatch }} />
            {b.label}
          </button>
        ))}
      </div>

      <div className="label mt16">Tamaño de letra</div>
      <div className="mt8">
        <Segmented<TextSize>
          value={s.textSize ?? 'normal'}
          onChange={(textSize) => updateSettings({ textSize })}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Grande' },
            { value: 'xlarge', label: 'Muy grande' },
          ]}
        />
      </div>

      <div className="label mt16">Saludo</div>
      <div className="emoji-grid mt8" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={(s.emoji || '👋') === e ? 'on' : ''} onClick={() => updateSettings({ emoji: e })} aria-label={`Saludo ${e}`}>
            {e}
          </button>
        ))}
      </div>

      <button className="btn secondary block mt16" onClick={() => setLayoutOpen(true)}>
        <LayoutList size={18} /> Qué sale en Hoy y en qué orden
      </button>
      {layoutOpen && <TodayLayoutSheet onClose={() => setLayoutOpen(false)} />}
    </div>
  );
}

function TodayLayoutSheet({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const layout = resolveLayout(state.settings.todayLayout);
  const save = (next: typeof layout) => updateSettings({ todayLayout: next });
  const move = (i: number, d: number) => {
    const next = [...layout];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    save(next);
  };
  return (
    <Sheet open onClose={onClose} title="Pantalla Hoy">
      <p className="small muted" style={{ marginTop: 0 }}>
        Ordena los bloques con las flechas y apaga los que no quieras ver. Lo que no tenga nada ese día no sale igualmente.
      </p>
      <div className="card" style={{ padding: '4px 12px' }}>
        {layout.map((l, i) => {
          const meta = TODAY_SECTIONS.find((t) => t.key === l.key)!;
          return (
            <div key={l.key} className={`layout-row ${l.hidden ? 'off' : ''}`}>
              <span aria-hidden>{meta.emoji}</span>
              <span className="grow">{meta.label}</span>
              <button className="icon-btn small plain" aria-label={`Subir ${meta.label}`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={16} />
              </button>
              <button className="icon-btn small plain" aria-label={`Bajar ${meta.label}`} disabled={i === layout.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={16} />
              </button>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={!l.hidden}
                  aria-label={`Mostrar ${meta.label}`}
                  onChange={(e) => save(layout.map((x) => (x.key === l.key ? { ...x, hidden: !e.target.checked } : x)))}
                />
                <span />
              </span>
            </div>
          );
        })}
      </div>
      <button className="btn ghost block mt12" onClick={() => updateSettings({ todayLayout: undefined })}>
        Volver al orden de siempre
      </button>
    </Sheet>
  );
}
