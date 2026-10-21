import { MONTHS } from '../lib/dates';

export interface BirthdayDraft {
  name: string;
  day?: number;
  month?: number;
  year?: number;
  notes?: string;
}

export function BirthdayFields({ draft: d, onChange, showName = true }: { draft: BirthdayDraft; onChange: (p: Partial<BirthdayDraft>) => void; showName?: boolean }) {
  return (
    <div>
      {showName && (
        <div className="field">
          <label htmlFor="bf-name">¿De quién?</label>
          <input id="bf-name" className="input" value={d.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Nombre" />
        </div>
      )}
      <div className="field">
        <span className="label">Día</span>
        <div className="hstack">
          <select className="select" aria-label="Día" style={{ flex: '0 0 92px' }} value={d.day ?? ''} onChange={(e) => onChange({ day: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select className="select grow" aria-label="Mes" value={d.month ?? ''} onChange={(e) => onChange({ month: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Mes</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="bf-year">Año de nacimiento (opcional)</label>
        <input
          id="bf-year"
          className="input"
          inputMode="numeric"
          placeholder="Para saber cuántos cumple"
          value={d.year ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
            onChange({ year: v ? Number(v) : undefined });
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="bf-notes">Ideas de regalo / notas</label>
        <textarea id="bf-notes" className="textarea" value={d.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} placeholder="Le encanta la cerámica…" />
      </div>
    </div>
  );
}

export function validBirthday(d: BirthdayDraft): boolean {
  if (!d.name.trim() || !d.day || !d.month) return false;
  const max = new Date(2024, d.month, 0).getDate(); // 2024: bisiesto, admite 29-F
  return d.day <= max;
}
