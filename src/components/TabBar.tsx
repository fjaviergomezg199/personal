import { CalendarDays, CircleCheckBig, Plus, Settings, Sun } from 'lucide-react';
import { calendarDay } from '../lib/calendarState';
import { navigate, useRoute } from '../lib/router';
import { openSheet } from './sheets';

const TABS = [
  { key: 'hoy', label: 'Hoy', Icon: Sun },
  { key: 'calendario', label: 'Calendario', Icon: CalendarDays },
  { key: 'add', label: 'Añadir', Icon: Plus },
  { key: 'habitos', label: 'Hábitos', Icon: CircleCheckBig },
  { key: 'ajustes', label: 'Ajustes', Icon: Settings },
] as const;

export function TabBar() {
  const route = useRoute();
  const current = route.parts[0] === 'agenda' ? 'calendario' : (route.parts[0] ?? 'hoy');
  return (
    <nav className="tabbar" aria-label="Secciones">
      <div className="tabbar-inner">
        {TABS.map(({ key, label, Icon }) =>
          key === 'add' ? (
            <div key={key}>
              <button
                className="tab-add"
                aria-label="Añadir"
                // En el calendario, en el día que se está viendo
                onClick={() => openSheet({ type: 'quick', date: current === 'calendario' ? (calendarDay() ?? undefined) : undefined })}
              >
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
