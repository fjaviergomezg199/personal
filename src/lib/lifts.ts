import type { Lift } from '../store/types';
import { fold } from './quickParse';

export interface LiftDef {
  key: string;
  name: string;
  aliases: string[];
}

/** Levantamientos habituales con sus nombres en inglés/español y abreviaturas. */
export const LIFT_LIBRARY: LiftDef[] = [
  { key: 'back-squat', name: 'Sentadilla trasera', aliases: ['back squat', 'sentadilla trasera', 'sentadilla', 'bs'] },
  { key: 'front-squat', name: 'Sentadilla frontal', aliases: ['front squat', 'sentadilla frontal', 'fs'] },
  { key: 'overhead-squat', name: 'Overhead squat', aliases: ['overhead squat', 'sentadilla overhead', 'ohs'] },
  { key: 'deadlift', name: 'Peso muerto', aliases: ['deadlift', 'peso muerto', 'dl'] },
  { key: 'sumo-deadlift', name: 'Peso muerto sumo', aliases: ['sumo deadlift', 'peso muerto sumo', 'sdl'] },
  { key: 'clean', name: 'Clean', aliases: ['squat clean', 'clean', 'cargada'] },
  { key: 'power-clean', name: 'Power clean', aliases: ['power clean', 'cargada de potencia', 'pc'] },
  { key: 'clean-jerk', name: 'Clean & jerk', aliases: ['clean and jerk', 'clean & jerk', 'clean&jerk', 'c&j', 'dos tiempos'] },
  { key: 'snatch', name: 'Snatch', aliases: ['squat snatch', 'snatch', 'arrancada'] },
  { key: 'power-snatch', name: 'Power snatch', aliases: ['power snatch', 'arrancada de potencia'] },
  { key: 'jerk', name: 'Jerk', aliases: ['split jerk', 'push jerk', 'jerk'] },
  { key: 'push-press', name: 'Push press', aliases: ['push press'] },
  { key: 'strict-press', name: 'Press estricto', aliases: ['strict press', 'shoulder press', 'press estricto', 'press militar', 'press de hombro'] },
  { key: 'bench-press', name: 'Press banca', aliases: ['bench press', 'press de banca', 'press banca', 'bench'] },
  { key: 'thruster', name: 'Thruster', aliases: ['thrusters', 'thruster'] },
  { key: 'hip-thrust', name: 'Hip thrust', aliases: ['hip thrust', 'hip thrusts'] },
];

export function aliasesFor(name: string): string[] {
  const f = fold(name).trim();
  const def = LIFT_LIBRARY.find((d) => fold(d.name) === f || d.aliases.includes(f));
  return def ? Array.from(new Set([f, ...def.aliases])) : [f];
}

export function roundTo(x: number, step: number): number {
  if (!step || step <= 0) return Math.round(x * 10) / 10;
  return Math.round(x / step) * step;
}

export function formatKg(x: number): string {
  const r = Math.round(x * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(r * 10 === Math.round(r * 10) ? 1 : 2)).replace('.', ',');
}

export interface Load {
  liftId: string;
  liftName: string;
  pct: number;
  pct2?: number;
  kg: number;
  kg2?: number;
}

export interface AnnotatedLine {
  text: string;
  loads: Load[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lee un entrenamiento (texto pegado de la app del box) y calcula los kilos
 * de cada porcentaje según los RM guardados: "Peso muerto 5x3 @80%" → 112,5 kg.
 */
export function annotateWorkout(text: string, lifts: Lift[], rounding = 2.5): AnnotatedLine[] {
  const usable = lifts.filter((l) => l.rm > 0);
  const patterns = usable
    .flatMap((l) => Array.from(new Set([fold(l.name), ...l.aliases.map(fold)])).map((a) => ({ alias: a.trim(), lift: l })))
    .filter((p) => p.alias.length > 0)
    .sort((a, b) => b.alias.length - a.alias.length);

  let context: Lift | undefined;
  return text.split(/\r?\n/).map((line) => {
    const f = fold(line);
    if (!f.trim() || /^\s*(?:[a-h]\s*[).:-]|\(?[a-h]\)|parte|part|bloque|block)\s/i.test(f)) context = undefined;

    // Menciones de levantamientos (las más largas primero, sin solaparse).
    const mentions: { start: number; end: number; lift: Lift }[] = [];
    for (const p of patterns) {
      const re = new RegExp(`(^|[^a-z0-9&])(${escapeRe(p.alias)})(?=$|[^a-z0-9&])`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(f))) {
        const start = m.index + m[1].length;
        const end = start + m[2].length;
        if (!mentions.some((x) => start < x.end && end > x.start)) mentions.push({ start, end, lift: p.lift });
      }
    }
    mentions.sort((a, b) => a.start - b.start);

    const loads: Load[] = [];
    const pctRe = /(\d{2,3}(?:[.,]\d)?)\s*%?\s*(?:-|–|a|\/)\s*(\d{2,3}(?:[.,]\d)?)\s*%|(\d{2,3}(?:[.,]\d)?)\s*%/g;
    let m: RegExpExecArray | null;
    while ((m = pctRe.exec(f))) {
      const p1 = Number((m[1] ?? m[3]).replace(',', '.'));
      const p2 = m[2] ? Number(m[2].replace(',', '.')) : undefined;
      if (p1 < 30 || p1 > 120 || (p2 !== undefined && (p2 < 30 || p2 > 120))) continue;
      const before = mentions.filter((x) => x.end <= m!.index);
      const lift = before.length ? before[before.length - 1].lift : (mentions[0]?.lift ?? context);
      if (!lift) continue;
      loads.push({
        liftId: lift.id,
        liftName: lift.name,
        pct: p1,
        pct2: p2,
        kg: roundTo((lift.rm * p1) / 100, rounding),
        kg2: p2 !== undefined ? roundTo((lift.rm * p2) / 100, rounding) : undefined,
      });
    }
    if (mentions.length) context = mentions[mentions.length - 1].lift;
    return { text: line, loads };
  });
}

export function percentTable(rm: number, rounding = 2.5, from = 40, to = 100, step = 5) {
  const out: { pct: number; kg: number }[] = [];
  for (let p = to; p >= from; p -= step) out.push({ pct: p, kg: roundTo((rm * p) / 100, rounding) });
  return out;
}

/** Discos por lado para cargar un peso con una barra dada. */
export function platesPerSide(total: number, bar = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25]): number[] | null {
  let side = (total - bar) / 2;
  if (side < 0) return null;
  const out: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      out.push(p);
      side -= p;
    }
  }
  return side < 0.01 ? out : null;
}
