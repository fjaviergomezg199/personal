import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { confirmDialog, Empty, Sheet, toast } from '../components/ui';
import { formatRelative, toHHMM } from '../lib/dates';
import { describeDriveError, listDriveCopies, restoreFromDrive, setDriveRestoreOpen, useDriveRestoreOpen, type DriveCopy } from '../lib/driveBackup';
import { navigate } from '../lib/router';
import { connectGoogle } from '../lib/syncRunner';
import { getState } from '../store/store';

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const size = (b: number) => (b >= 1024 * 1024 ? `${nf.format(b / 1024 / 1024)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** La hoja para elegir qué copia de Drive recuperar (se abre desde Ajustes, la bienvenida o al volver de Google). */
export function DriveRestoreHost() {
  const open = useDriveRestoreOpen();
  return open ? <DriveRestoreSheet onClose={() => setDriveRestoreOpen(false)} /> : null;
}

function DriveRestoreSheet({ onClose }: { onClose: () => void }) {
  const [copies, setCopies] = useState<DriveCopy[] | null>(null);
  const [problem, setProblem] = useState<{ message: string; link?: string; auth?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listDriveCopies()
      .then(setCopies)
      .catch((err: unknown) => {
        const r = describeDriveError(err);
        if (r.status === 'needs-auth') setProblem({ message: 'Hay que volver a dar permiso a Google Drive.', auth: true });
        else if (r.status === 'offline') setProblem({ message: 'Sin conexión. Inténtalo cuando vuelvas a tener internet.' });
        else setProblem({ message: r.message, link: r.link });
      });
  }, []);

  const label = (c: DriveCopy) => `${formatRelative(c.day)}${c.modified ? ` a las ${toHHMM(new Date(c.modified))}` : ''}`;

  const restore = async (c: DriveCopy) => {
    if (getState().settings.onboarded) {
      const ok = await confirmDialog({
        title: `¿Recuperar la copia de ${label(c).toLowerCase()}?`,
        message: 'Se sustituirá todo lo que hay ahora en la app por lo que había en esa copia.',
        confirm: 'Recuperar',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(c.id);
    try {
      const r = await restoreFromDrive(c);
      toast(`Copia recuperada: ${r.areas} áreas, ${r.entries} elementos${r.docs ? ` y ${r.docs} archivos` : ''}${r.missing ? ` (faltan ${r.missing})` : ''}`, { duration: 6000 });
      onClose();
      navigate('/hoy');
    } catch (err) {
      const d = describeDriveError(err);
      setProblem({ message: d.status === 'error' ? d.message : 'No se pudo recuperar la copia. Inténtalo otra vez.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Recuperar de Google Drive">
      {!copies && !problem && <p className="muted center">Buscando tus copias…</p>}
      {problem && (
        <div className="card" style={{ background: 'var(--warning-soft)' }}>
          <div className="small">{problem.message}</div>
          {problem.link && (
            <a className="btn small secondary mt8" href={problem.link} target="_blank" rel="noopener noreferrer">
              Activar la API de Google Drive
            </a>
          )}
          {problem.auth && (
            <button className="btn small mt8" onClick={() => connectGoogle({ then: 'drive-restore' })}>
              Dar permiso
            </button>
          )}
        </div>
      )}
      {copies?.length === 0 && <Empty emoji="☁️" title="No hay copias en tu Drive" text="Activa «Copia automática en Google Drive» en Ajustes y aparecerán aquí." />}
      {copies && copies.length > 0 && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Elige la copia. Se recupera todo: agenda, áreas, listas, finanzas, hábitos y los archivos.
          </p>
          <div className="list">
            {copies.map((c, i) => (
              <button key={c.id} className="row tappable no-lead" disabled={!!busy} onClick={() => void restore(c)}>
                <span className="mv-emoji" aria-hidden>
                  {i === 0 ? '☁️' : '🗂️'}
                </span>
                <div className="body">
                  <div className="title">{label(c)}</div>
                  <div className="meta">
                    <span>{size(c.size)}</span>
                    {i === 0 && <span className="badge tone-green">La más reciente</span>}
                  </div>
                </div>
                {busy === c.id && <RefreshCw size={18} className="spin" />}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
