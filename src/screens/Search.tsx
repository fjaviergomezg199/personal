import { ChevronLeft, Search as SearchIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openSheet } from '../components/sheets';
import { Empty } from '../components/ui';
import { searchAll, type Hit } from '../lib/search';
import { navigate } from '../lib/router';
import { useToday } from '../lib/useToday';
import { useApp } from '../store/store';

const RECENT_KEY = 'diaadia:recentSearches';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function remember(q: string) {
  try {
    const list = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* nada */
  }
}

/** Buscar en toda la app. */
export function Search() {
  const state = useApp();
  const today = useToday();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState(loadRecent);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => searchAll(state, q, today), [state, q, today]);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  const go = (h: Hit) => {
    remember(q.trim());
    setRecent(loadRecent());
    if ('sheet' in h.go) openSheet(h.go.sheet);
    else navigate(h.go.path);
  };

  return (
    <div className="screen">
      <button className="back-link" onClick={() => history.back()}>
        <ChevronLeft size={22} /> Volver
      </button>
      <div className="search-bar">
        <SearchIcon size={19} color="var(--text-3)" />
        <input
          className="grow"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar planes, tareas, categorías, cumpleaños…"
          aria-label="Buscar"
          enterKeyHint="search"
        />
        {q && (
          <button className="icon-btn small plain" aria-label="Borrar búsqueda" onClick={() => setQ('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {!q.trim() && recent.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Búsquedas recientes</h2>
          </div>
          <div className="chips">
            {recent.map((r) => (
              <button key={r} className="chip" onClick={() => setQ(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {q.trim().length >= 2 && !total && (
        <div className="card mt16">
          <Empty emoji="🔎" title="Nada por aquí" text="Prueba con otra palabra (no hace falta poner tildes)." />
        </div>
      )}

      {groups.map((g) => {
        const all = open[g.key];
        const hits = all ? g.hits : g.hits.slice(0, 6);
        return (
          <div key={g.key} className="section">
            <div className="section-head">
              <h2>
                {g.label} <span className="count">{g.hits.length}</span>
              </h2>
            </div>
            <div className="list">
              {hits.map((h) => (
                <button key={h.key} className="row tappable no-lead" onClick={() => go(h)}>
                  <span className="mv-emoji" aria-hidden>
                    {h.emoji}
                  </span>
                  <div className="body">
                    <div className="title">{h.title}</div>
                    {h.detail && <div className="meta">{h.detail}</div>}
                  </div>
                </button>
              ))}
            </div>
            {g.hits.length > 6 && (
              <button className="link-btn mt8" onClick={() => setOpen({ ...open, [g.key]: !all })}>
                {all ? 'Ver menos' : `Ver los ${g.hits.length}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
