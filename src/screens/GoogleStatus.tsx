import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { pendingGoogleChanges } from '../lib/sync';
import { connectGoogle, googleLinked, runSync, useSyncStatus } from '../lib/syncRunner';
import { useApp } from '../store/store';

export function GoogleStatusButton() {
  useApp();
  const st = useSyncStatus();
  if (!googleLinked()) return null;
  const pending = pendingGoogleChanges();
  if (st.running)
    return (
      <button className="icon-btn" aria-label="Sincronizando" disabled>
        <RefreshCw size={18} className="spin" />
      </button>
    );
  if (st.needsAuth)
    return (
      <button className="icon-btn" aria-label="Reconectar con Google" onClick={() => connectGoogle({ silentFirst: true })} style={{ position: 'relative' }}>
        <CloudOff size={18} />
        {pending > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 9, background: 'var(--danger)' }} />}
      </button>
    );
  return (
    <button className="icon-btn" aria-label="Sincronizar con Google Calendar" onClick={() => void runSync({ manual: true })}>
      <Cloud size={18} />
    </button>
  );
}

export function GoogleBanner() {
  useApp();
  const st = useSyncStatus();
  if (!googleLinked() || !st.needsAuth) return null;
  const pending = pendingGoogleChanges();
  if (!pending) return null;
  return (
    <div className="banner tone-amber mt12">
      <div className="big">☁️</div>
      <div className="grow">
        <div className="t">
          {pending === 1 ? '1 cambio' : `${pending} cambios`} sin enviar a Google Calendar
        </div>
        <div className="d">Envíalos para que Google te avise aunque la app esté cerrada.</div>
      </div>
      <button className="btn small tone" onClick={() => connectGoogle({ silentFirst: true })}>
        Enviar
      </button>
    </div>
  );
}
