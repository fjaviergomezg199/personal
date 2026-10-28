import { openSheet } from './sheets';
import { Sheet } from './ui';

/** Lo que llega con «Compartir → Día a Día» (Android): apuntarlo o importarlo al calendario. */
export function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const go = (fn: () => void) => {
    onClose();
    setTimeout(fn, 50);
  };
  return (
    <Sheet open onClose={onClose} title="¿Qué hago con esto?">
      <div className="code-box" style={{ whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto', marginBottom: 14 }}>
        {text}
      </div>
      <div className="stack">
        <button className="btn secondary block" onClick={() => go(() => openSheet({ type: 'quick', text: text.split('\n')[0].slice(0, 200) }))}>
          📅 Apuntarlo en el calendario
        </button>
        <button className="btn secondary block" onClick={() => go(() => openSheet({ type: 'import', text }))}>
          📥 Importarlo (un plan con varios días)
        </button>
      </div>
    </Sheet>
  );
}
