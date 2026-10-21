import { CalendarDays, LayoutGrid, Plus, Settings, Sun } from 'lucide-react';
import { navigate, useRoute } from '../lib/router';
import { openSheet } from './sheets';

const TABS = [
  { key: 'hoy', label: 'Hoy', Icon: Sun },
  { key: 'agenda', label: 'Agenda', Icon: CalendarDays },
  { key: 'add', label: 'Añadir', Icon: Plus },
  { key: 'areas', label: 'Áreas', Icon: LayoutGrid },
  { key: 'ajustes', label: 'Ajustes', Icon: Settings },
] as const;

export function TabBar() {
  const route = useRoute();
  const current = route.parts[0] ?? 'hoy';
  return (
    <nav className="tabbar" aria-label="Secciones">
      <div className="tabbar-inner">
        {TABS.map(({ key, label, Icon }) =>
          key === 'add' ? (
            <div key={key}>
              <button className="tab-add" aria-label="Añadir" onClick={() => openSheet({ type: 'quick' })}>
                <Plus size={28} strokeWidth={2.4} />
              </button>
            </div>
          ) : (
            <button
              key={key}
              className={`tab ${current === key ? 'on' : ''}`}
              aria-current={current === key ? 'page' : undefined}
              onClick={() => navigate(`/${key}`)}
            >
              <Icon size={23} strokeWidth={current === key ? 2.4 : 2} />
              {label}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
