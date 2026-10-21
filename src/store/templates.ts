import type { Area, AreaColor, ModuleKey, TemplateKey } from './types';

export interface TemplateInfo {
  key: TemplateKey;
  name: string;
  emoji: string;
  color: AreaColor;
  modules: ModuleKey[];
  labels?: Partial<Record<ModuleKey, string>>;
  description: string;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    key: 'studies',
    name: 'Estudios',
    emoji: '📚',
    color: 'violet',
    modules: ['plan', 'tasks', 'docs', 'goals', 'notes'],
    labels: { plan: 'Plan de estudio', tasks: 'Entregas y exámenes' },
    description: 'Tu planificación día a día, los PDF de Claude y las entregas.',
  },
  {
    key: 'running',
    name: 'Running',
    emoji: '🏃',
    color: 'orange',
    modules: ['plan', 'goals', 'docs', 'notes'],
    labels: { plan: 'Entrenamientos' },
    description: 'Tu plan de carreras sesión a sesión, con lo que has hecho.',
  },
  {
    key: 'gym',
    name: 'CrossFit',
    emoji: '🏋️',
    color: 'rose',
    modules: ['plan', 'lifts', 'goals', 'notes'],
    labels: { plan: 'WODs', lifts: 'Mis RM' },
    description: 'Pega el WOD del box y te calcula los kilos de cada % con tus RM.',
  },
  {
    key: 'nutrition',
    name: 'Nutrición',
    emoji: '🥗',
    color: 'green',
    modules: ['menu', 'diary', 'metrics', 'shopping', 'docs', 'goals', 'notes'],
    labels: { menu: 'Menú semanal' },
    description: 'El menú de la nutri, calorías y macros de lo que comes, tu peso y la compra.',
  },
  {
    key: 'work',
    name: 'Trabajo',
    emoji: '💼',
    color: 'blue',
    modules: ['tasks', 'goals', 'notes', 'docs'],
    labels: { tasks: 'Pendientes', goals: 'Objetivos' },
    description: 'Pendientes, objetivos de la semana y notas de un trabajo.',
  },
  {
    key: 'home',
    name: 'Hogar',
    emoji: '🏠',
    color: 'amber',
    modules: ['shopping', 'chores', 'notes'],
    description: 'Lista de la compra y tareas de casa, compartidas entre los dos móviles.',
  },
  {
    key: 'custom',
    name: 'Otra área',
    emoji: '⭐',
    color: 'teal',
    modules: ['tasks', 'goals', 'notes'],
    description: 'Una lista en blanco: eliges tú los bloques.',
  },
];

export function templateInfo(key: TemplateKey): TemplateInfo {
  return TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[TEMPLATES.length - 1];
}

export const MODULE_INFO: Record<ModuleKey, { label: string; emoji: string; description: string }> = {
  plan: { label: 'Plan día a día', emoji: '🗓️', description: 'Sesiones con fecha: estudio, carreras, WODs… Se importan desde Claude.' },
  tasks: { label: 'Pendientes', emoji: '✅', description: 'Lista de cosas por hacer, con fecha si quieres.' },
  goals: { label: 'Objetivos', emoji: '🎯', description: 'Objetivos de la semana o del mes con su progreso.' },
  docs: { label: 'Documentos', emoji: '📎', description: 'PDF, artefactos de Claude, enlaces y textos.' },
  menu: { label: 'Menú semanal', emoji: '🍽️', description: 'Qué toca comer cada día de la semana.' },
  lifts: { label: 'RM y porcentajes', emoji: '💪', description: 'Tus marcas y los kilos de cada porcentaje.' },
  notes: { label: 'Notas', emoji: '📝', description: 'Un bloc de notas libre.' },
  shopping: { label: 'Lista de la compra', emoji: '🛒', description: 'Una sola lista de la compra, que podéis compartir los dos.' },
  chores: { label: 'Tareas de casa', emoji: '🧹', description: 'Lo que hay que hacer en casa, compartido si queréis.' },
  diary: { label: 'Calorías y macros', emoji: '🔥', description: 'Apunta lo que comes con cantidades: calorías, proteína, hidratos y grasa.' },
  metrics: { label: 'Peso y medidas', emoji: '⚖️', description: 'Tu peso (y otras medidas) con la gráfica de cómo evoluciona.' },
};

export function moduleLabel(area: Pick<Area, 'labels'>, m: ModuleKey): string {
  return area.labels?.[m] ?? MODULE_INFO[m].label;
}

export const MODULE_ORDER: ModuleKey[] = ['plan', 'menu', 'diary', 'metrics', 'shopping', 'chores', 'tasks', 'lifts', 'goals', 'docs', 'notes'];

export const AREA_COLORS: AreaColor[] = ['violet', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'pink', 'slate'];

export const EMOJI_CHOICES = [
  '📚', '🎨', '🏛️', '🏃', '🏋️', '🚴', '🧘', '🏊', '🥗', '🍎', '💼', '🏫', '🏢', '🧑‍🏫', '⚖️', '🏠',
  '💶', '✈️', '🎵', '📖', '🧠', '❤️', '🌱', '🐶', '👶', '🎯', '⭐', '🛠️', '💻', '📸', '🎮', '🧹',
];
