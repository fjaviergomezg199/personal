import { ArrowDown, ArrowUp, ChevronLeft, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, Empty, Sheet, Switch, toast } from '../components/ui';
import { navigate, useRoute } from '../lib/router';
import { DiaryModule } from '../modules/DiaryModule';
import { DocsModule } from '../modules/DocsModule';
import { FinanceModule } from '../modules/FinanceModule';
import { HabitsModule } from '../modules/HabitsModule';
import { GoalsModule } from '../modules/GoalsModule';
import { LiftsModule } from '../modules/LiftsModule';
import { ListModule } from '../modules/ListModule';
import { MenuModule } from '../modules/MenuModule';
import { MetricsModule } from '../modules/MetricsModule';
import { NotesModule } from '../modules/NotesModule';
import { PlanModule } from '../modules/PlanModule';
import { TasksModule } from '../modules/TasksModule';
import { deleteArea, moveArea, updateArea, useApp } from '../store/store';
import { AREA_COLORS, EMOJI_CHOICES, MODULE_INFO, MODULE_ORDER, moduleLabel } from '../store/templates';
import type { Area, ModuleKey } from '../store/types';

export function AreaDetail({ id }: { id: string }) {
  const state = useApp();
  const route = useRoute();
  const [settings, setSettings] = useState(false);
  const area = state.areas.find((a) => a.id === id);

  if (!area) {
    return (
      <div className="screen">
        <button className="back-link" onClick={() => navigate('/areas')}>
          <ChevronLeft size={22} /> Áreas
        </button>
        <Empty emoji="🤷" title="Esta área ya no existe" />
      </div>
    );
  }

  const modules = MODULE_ORDER.filter((m) => area.modules.includes(m));
  const requested = route.query.get('bloque') as ModuleKey | null;
  const current = requested && modules.includes(requested) ? requested : modules[0];
  const select = (m: ModuleKey) => navigate(`/areas/${area.id}?bloque=${m}`, { replace: true });

  return (
    <div className={`screen tone-${area.color}`}>
      <button className="back-link" onClick={() => navigate('/areas')}>
        <ChevronLeft size={22} /> Áreas
      </button>
      <div className="area-hero">
        <div className="em" aria-hidden>
          {area.emoji}
        </div>
        <div className="grow">
          <h1>{area.name}</h1>
        </div>
        <button className="icon-btn" aria-label="Ajustes del área" onClick={() => setSettings(true)}>
          <Settings2 size={19} />
        </button>
      </div>

      {modules.length > 1 && (
        <div className="tabs-scroll" style={{ background: 'var(--bg)' }}>
          {modules.map((m) => (
            <button key={m} className={`chip ${current === m ? 'on' : ''}`} onClick={() => select(m)}>
              {MODULE_INFO[m].emoji} {moduleLabel(area, m)}
            </button>
          ))}
        </div>
      )}

      {!current && (
        <div className="card">
          <Empty
            emoji="🧱"
            title="Esta área no tiene bloques"
            text="Añade un plan, pendientes, objetivos, documentos…"
            action={
              <button className="btn small" onClick={() => setSettings(true)}>
                Elegir bloques
              </button>
            }
          />
        </div>
      )}
      {current === 'plan' && <PlanModule area={area} />}
      {current === 'tasks' && <TasksModule area={area} />}
      {current === 'goals' && <GoalsModule area={area} />}
      {current === 'docs' && <DocsModule area={area} />}
      {current === 'menu' && <MenuModule area={area} />}
      {current === 'lifts' && <LiftsModule area={area} />}
      {current === 'notes' && <NotesModule area={area} />}
      {current === 'shopping' && <ListModule area={area} list="compra" />}
      {current === 'chores' && <ListModule area={area} list="casa" />}
      {current === 'diary' && <DiaryModule area={area} />}
      {current === 'metrics' && <MetricsModule area={area} />}
      {current === 'money' && <FinanceModule area={area} scope="personal" />}
      {current === 'jointMoney' && <FinanceModule area={area} scope="hogar" />}
      {current === 'habits' && <HabitsModule />}

      {settings && <AreaSettingsSheet area={area} onClose={() => setSettings(false)} />}
    </div>
  );
}

function AreaSettingsSheet({ area, onClose }: { area: Area; onClose: () => void }) {
  const [name, setName] = useState(area.name);
  const state = useApp();
  const sorted = [...state.areas].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((a) => a.id === area.id);

  const toggleModule = (m: ModuleKey, on: boolean) => {
    const modules = on ? [...area.modules, m] : area.modules.filter((x) => x !== m);
    updateArea(area.id, { modules });
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `¿Borrar «${area.name}»?`,
      message: 'Se borrará el área con su plan, pendientes, objetivos y documentos. No se puede deshacer.',
      confirm: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    deleteArea(area.id);
    toast('Área borrada');
    navigate('/areas');
  };

  return (
    <Sheet open onClose={onClose} title="Ajustes del área">
      <div className="field">
        <label htmlFor="as-name">Nombre</label>
        <input
          id="as-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== area.name && updateArea(area.id, { name: name.trim() })}
        />
      </div>
      <div className="field">
        <span className="label">Icono</span>
        <div className="emoji-grid">
          {Array.from(new Set([area.emoji, ...EMOJI_CHOICES])).map((e) => (
            <button key={e} type="button" className={area.emoji === e ? 'on' : ''} onClick={() => updateArea(area.id, { emoji: e })} aria-label={`Icono ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Color</span>
        <div className="color-row">
          {AREA_COLORS.map((c) => (
            <button key={c} type="button" className={`color-dot tone-${c} ${area.color === c ? 'on' : ''}`} onClick={() => updateArea(area.id, { color: c })} aria-label={`Color ${c}`} />
          ))}
        </div>
      </div>

      <div className="divider" />
      <div className="label">Bloques del área</div>
      {MODULE_ORDER.map((m) => (
        <Switch
          key={m}
          checked={area.modules.includes(m)}
          onChange={(on) => toggleModule(m, on)}
          label={`${MODULE_INFO[m].emoji} ${moduleLabel(area, m)}`}
          description={MODULE_INFO[m].description}
        />
      ))}

      <div className="divider" />
      <Switch
        checked={area.showOnToday}
        onChange={(v) => updateArea(area.id, { showOnToday: v })}
        label="Mostrar en Hoy y en la agenda"
        description="Lo que toca cada día (sesiones, menú, tareas con fecha) aparece en tu resumen."
      />

      <div className="divider" />
      <div className="hstack">
        <span className="grow label">Orden en la lista</span>
        <button className="icon-btn small" aria-label="Subir" disabled={index <= 0} onClick={() => moveArea(area.id, -1)}>
          <ArrowUp size={16} />
        </button>
        <button className="icon-btn small" aria-label="Bajar" disabled={index >= sorted.length - 1} onClick={() => moveArea(area.id, 1)}>
          <ArrowDown size={16} />
        </button>
      </div>

      <button className="btn danger block mt24" onClick={remove}>
        <Trash2 size={18} /> Borrar área
      </button>
    </Sheet>
  );
}
