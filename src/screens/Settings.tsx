import { Bell, CalendarCheck, CloudDownload, CloudUpload, Copy, Download, RefreshCw, Smartphone, Upload, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { confirmDialog, SectionHead, Switch, toast } from '../components/ui';
import { exportBackup, importBackup } from '../lib/backup';
import { formatAlert, formatRelative, toHHMM, toISODate } from '../lib/dates';
import { DRIVE_FOLDER, KEEP_COPIES, useDriveRunning } from '../lib/driveBackup';
import { copyText } from '../lib/files';
import { appBaseUrl, appOrigin, clearToken, DRIVE_SCOPE, hasScope, hasValidToken } from '../lib/google';
import { notificationPermission, requestNotificationPermission, showSystemNotification } from '../lib/notify';
import { pendingGoogleChanges } from '../lib/sync';
import { connectGoogle, runDriveBackup, runSync, startDriveRestore, useSyncStatus } from '../lib/syncRunner';
import { kv, requestPersistence } from '../store/db';
import { createInitialState, replaceState, setCloseDayReminder, setGoogleData, update, updateGoogle, updateSettings, useApp } from '../store/store';
import { closeDayLink, turnOnCloseReminder } from '../sheets/CloseDaySheet';
import { closeDayReminderOn } from '../lib/closeDay';
import { HomeShareSheet } from '../sheets/HomeShareSheet';
import { AppearanceCard } from './Appearance';
import { InstallCard } from './Install';


export function Settings() {
  const state = useApp();
  const s = state.settings;
  const [name, setName] = useState(s.name);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Ajustes</h1>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="st-name">Tu nombre</label>
          <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateSettings({ name: name.trim() })} />
        </div>
      </div>

      <InstallCard />

      <div className="section">
        <SectionHead title={<><Bell size={18} /> Avisos</>} />
        <NotificationsCard />
      </div>

      <div className="section">
        <SectionHead title={<><CalendarCheck size={18} /> Google Calendar</>} />
        <GoogleCard />
      </div>

      <div className="section">
        <SectionHead title={<><Users size={18} /> Hogar compartido</>} />
        <HomeShareCard />
      </div>

      <div className="section">
        <SectionHead title="Copia de seguridad" />
        <DriveBackupCard />
        <BackupCard />
      </div>

      <div className="section">
        <SectionHead title="Apariencia" />
        <AppearanceCard />
      </div>

      <div className="section">
        <SectionHead title="Acerca de" />
        <AboutCard />
      </div>
    </div>
  );
}

function NotificationsCard() {
  const state = useApp();
  const s = state.settings;
  const closeOn = closeDayReminderOn(state);
  const [perm, setPerm] = useState(notificationPermission());
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const enable = async () => {
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === 'granted') {
      updateSettings({ notifications: true });
      await showSystemNotification({ key: 'test', title: '🔔 Avisos activados', body: 'Así te avisará Día a Día.', at: Date.now(), route: '#/hoy' });
    } else if (p === 'denied') toast('Los avisos están bloqueados. Actívalos en los ajustes del móvil para esta app.', { duration: 7000 });
  };

  return (
    <div className="card">
      {perm === 'unsupported' ? (
        <p className="small muted" style={{ marginTop: 0 }}>
          {isIOS && !standalone
            ? 'En iPhone, los avisos solo funcionan con la app instalada en la pantalla de inicio (mira «Instalar en el móvil»).'
            : 'Este navegador no permite avisos.'}
        </p>
      ) : perm === 'granted' && s.notifications ? (
        <Switch checked label="Avisos de la app" description="Activados en este dispositivo." onChange={(v) => updateSettings({ notifications: v })} />
      ) : (
        <div className="hstack" style={{ marginBottom: 6 }}>
          <div className="grow small muted">Permite los avisos para que la app te recuerde las cosas.</div>
          <button className="btn small" onClick={enable}>
            Activar
          </button>
        </div>
      )}

      <div className="two mt12">
        <div className="field">
          <label htmlFor="st-def">Aviso por defecto</label>
          <select
            id="st-def"
            className="select"
            value={s.defaultAlert === null ? 'none' : String(s.defaultAlert)}
            onChange={(e) => updateSettings({ defaultAlert: e.target.value === 'none' ? null : Number(e.target.value) })}
          >
            <option value="none">Sin aviso</option>
            {[0, 5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {formatAlert(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-bday">Cumpleaños</label>
          <select
            id="st-bday"
            className="select"
            value={s.birthdayAlert === null ? 'none' : String(s.birthdayAlert)}
            onChange={(e) => {
              updateSettings({ birthdayAlert: e.target.value === 'none' ? null : Number(e.target.value) });
              // Hay que actualizar los avisos de los cumpleaños en Google
              update((st) => st.birthdays.forEach((b) => (b.dirty = true)));
            }}
          >
            <option value="none">Sin aviso</option>
            <option value="900">{formatAlert(900, true)}</option>
            <option value="240">{formatAlert(240, true)}</option>
          </select>
        </div>
      </div>
      <div className="divider" />
      <Switch
        checked={closeOn}
        label="🌙 Cerrar el día"
        description={
          closeOn && s.closeDay
            ? `Aviso cada noche a las ${s.closeDay.time}: un minuto para lo que te queda de hoy, con sí o no.`
            : 'Un aviso cada noche para dejar el día cerrado en un minuto (la tarjeta sale en Hoy igualmente).'
        }
        onChange={(on) => (on ? void turnOnCloseReminder(s.closeDay?.time ?? '22:00') : setCloseDayReminder(false, s.closeDay?.time ?? '22:00', ''))}
      />
      {closeOn && s.closeDay && (
        <div className="field">
          <label htmlFor="st-close">Hora del aviso</label>
          <input
            id="st-close"
            className="input"
            type="time"
            value={s.closeDay.time}
            onChange={(e) => e.target.value && setCloseDayReminder(true, e.target.value, closeDayLink())}
          />
        </div>
      )}
      <div className="callout mt16">
        <b>Para que te avise siempre</b>, aunque no abras la app: conecta Google Calendar aquí abajo. Tus recordatorios, planes y cumpleaños se guardan allí con su aviso y te
        avisa la app de Google Calendar del móvil. Sin Google, los avisos de esta app saltan cuando la tienes abierta o la abres.
      </div>
    </div>
  );
}

function GoogleCard() {
  const state = useApp();
  const g = state.settings.google;
  const st = useSyncStatus();
  const [clientId, setClientId] = useState(g.clientId);
  const [showSetup, setShowSetup] = useState(!g.clientId);
  const linked = !!g.clientId && !!g.email;
  const tokenOk = hasValidToken();
  const pending = pendingGoogleChanges();

  const saveClientId = () => {
    const v = clientId.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) {
      toast('El ID de cliente termina en «.apps.googleusercontent.com»');
      return;
    }
    updateGoogle({ clientId: v });
    setShowSetup(false);
    toast('ID guardado. Ahora pulsa «Conectar con Google».');
  };

  const writable = state.googleCalendars.filter((c) => c.canWrite);

  return (
    <div className="card">
      {linked ? (
        <>
          <div className="hstack">
            <div className="grow">
              <div style={{ fontWeight: 700 }}>✓ Conectado</div>
              <div className="small muted ellipsis">{g.email}</div>
            </div>
            <button className="btn small secondary" disabled={st.running} onClick={() => void runSync({ manual: true })}>
              <RefreshCw size={16} className={st.running ? 'spin' : ''} /> {tokenOk ? 'Sincronizar' : 'Reconectar'}
            </button>
          </div>
          <p className="hint">
            {g.lastSync
              ? `Última sincronización: ${formatRelative(toISODate(new Date(g.lastSync))).toLowerCase()} a las ${new Date(g.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
              : 'Aún no se ha sincronizado.'}
            {pending > 0 ? ` ${pending} cambio(s) pendientes de enviar.` : ''}
            {st.error ? ` Último error: ${st.error}` : ''}
          </p>
          <div className="divider" />
          <Switch
            checked={g.pushEntries}
            onChange={(v) => {
              updateGoogle({ pushEntries: v });
              if (v) void runSync();
            }}
            label="Enviar recordatorios, planes y tareas con fecha"
            description="Con su aviso, para que te avise Google Calendar."
          />
          <Switch
            checked={g.pushBirthdays}
            onChange={(v) => {
              updateGoogle({ pushBirthdays: v });
              if (v) void runSync();
            }}
            label="Enviar cumpleaños"
            description="Como evento anual con aviso."
          />
          <Switch
            checked={g.autoReconnect}
            onChange={(v) => updateGoogle({ autoReconnect: v })}
            label="Reconectar sola"
            description="Google pide renovar el permiso cada hora. Si hay algo que enviar, la app lo renueva sola (verás un parpadeo)."
          />
          {writable.length > 0 && (
            <div className="field mt12">
              <label htmlFor="st-cal">Guardar en el calendario</label>
              <select id="st-cal" className="select" value={g.writeCalendarId} onChange={(e) => updateGoogle({ writeCalendarId: e.target.value })}>
                {writable.map((c) => (
                  <option key={c.id} value={c.primary ? 'primary' : c.id}>
                    {c.name}
                    {c.primary ? ' (principal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {state.googleCalendars.length > 0 && (
            <div className="field mt12">
              <span className="label">Calendarios que ves en tu agenda</span>
              {state.googleCalendars.map((c) => {
                const id = c.primary ? 'primary' : c.id;
                const on = g.readCalendarIds.includes(id);
                return (
                  <label key={c.id} className="hstack" style={{ padding: '6px 2px' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = e.target.checked ? [...g.readCalendarIds, id] : g.readCalendarIds.filter((x) => x !== id);
                        updateGoogle({ readCalendarIds: next });
                        void runSync();
                      }}
                      style={{ width: 20, height: 20 }}
                    />
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color ?? 'var(--primary)' }} />
                    <span className="grow">{c.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <button
            className="link-btn mt12"
            style={{ color: 'var(--danger)' }}
            onClick={async () => {
              const ok = await confirmDialog({
                title: '¿Desconectar Google Calendar?',
                message: 'Lo que ya está en Google se queda allí. La app dejará de enviar cambios y de mostrar tus eventos de Google.',
                confirm: 'Desconectar',
                danger: true,
              });
              if (!ok) return;
              clearToken();
              updateGoogle({ email: undefined, lastSync: undefined });
              setGoogleData([], []);
            }}
          >
            Desconectar
          </button>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Ve tus eventos de Google en la agenda y guarda allí tus recordatorios, planes y cumpleaños (con aviso).
          </p>
          {g.clientId && !showSetup ? (
            <>
              <button className="btn block" onClick={() => connectGoogle()}>
                Conectar con Google
              </button>
              <button className="link-btn mt8" onClick={() => setShowSetup(true)}>
                Cambiar el ID de cliente
              </button>
            </>
          ) : (
            <GoogleSetup clientId={clientId} setClientId={setClientId} onSave={saveClientId} />
          )}
        </>
      )}
    </div>
  );
}

function CopyLine({ value }: { value: string }) {
  return (
    <div className="hstack mt8">
      <div className="code-box grow">{value}</div>
      <button className="icon-btn small" aria-label="Copiar" onClick={async () => toast((await copyText(value)) ? 'Copiado' : 'No se pudo copiar')}>
        <Copy size={15} />
      </button>
    </div>
  );
}

function GoogleSetup({ clientId, setClientId, onSave }: { clientId: string; setClientId: (v: string) => void; onSave: () => void }) {
  return (
    <div>
      <div className="callout">
        <b>Configuración (una sola vez, ~5 minutos):</b>
        <ol>
          <li>
            Entra en{' '}
            <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">
              console.cloud.google.com
            </a>{' '}
            y crea un proyecto (p. ej. «Día a Día»).
          </li>
          <li>
            Activa la{' '}
            <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer">
              Google Calendar API
            </a>{' '}
            y la{' '}
            <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">
              Google Drive API
            </a>{' '}
            (botón «Habilitar» en cada una; Drive es para la copia de seguridad).
          </li>
          <li>
            En <b>Google Auth Platform</b> → «Comenzar»: nombre de la app, tu correo y tipo <b>Externo</b>.
          </li>
          <li>
            En <b>Público</b> pulsa <b>«Publicar app»</b> (así el permiso no caduca cada semana). No hace falta verificarla: al conectar, Google dirá que no está
            verificada → «Configuración avanzada» → «Ir a Día a Día».
          </li>
          <li>
            En <b>Clientes</b> → «Crear cliente» → <b>Aplicación web</b>, y añade:
            <div className="tiny mt8">Orígenes autorizados de JavaScript</div>
            <CopyLine value={appOrigin()} />
            <div className="tiny mt8">URIs de redirección autorizados</div>
            <CopyLine value={appBaseUrl()} />
          </li>
          <li>Copia el «ID de cliente» y pégalo aquí. Si otra persona usa la app en su móvil, puede usar este mismo ID.</li>
        </ol>
      </div>
      <div className="field mt12">
        <label htmlFor="st-cid">ID de cliente de Google</label>
        <input
          id="st-cid"
          className="input"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="123…apps.googleusercontent.com"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <button className="btn block mt12" onClick={onSave} disabled={!clientId.trim()}>
        Guardar ID
      </button>
    </div>
  );
}

/** «hoy a las 09:12», «ayer a las 21:40», «el lunes a las…» */
function when(isoTime: string): string {
  const d = new Date(isoTime);
  const rel = formatRelative(toISODate(d)).toLowerCase();
  return `${/^(hoy|ayer)$/.test(rel) ? rel : `el ${rel}`} a las ${toHHMM(d)}`;
}

function DriveBackupCard() {
  const state = useApp();
  const drive = state.settings.drive;
  const running = useDriveRunning();
  const clientId = state.settings.google.clientId;
  return (
    <div className="card">
      <Switch
        checked={!!drive?.on}
        label="Copia automática en Google Drive"
        description={`Cada día que haya cambios se guarda una copia en la carpeta «${DRIVE_FOLDER}» de tu Drive (las ${KEEP_COPIES} últimas). Solo la ve tu cuenta.`}
        onChange={(on) => {
          if (on && !clientId) {
            toast('Primero configura Google (arriba, en «Google Calendar»).', { duration: 6000 });
            return;
          }
          updateSettings({ drive: { ...(drive ?? {}), on } });
          if (on) void runDriveBackup({ manual: true });
        }}
      />
      {drive?.on && (
        <div className="small" style={{ margin: '2px 0 10px' }}>
          {running ? (
            <span className="muted">⏳ Guardando la copia…</span>
          ) : drive.error ? (
            <div className="callout" style={{ background: 'var(--warning-soft)' }}>
              ⚠️ {drive.error}
              {drive.errorLink && (
                <div className="mt8">
                  <a className="btn small secondary" href={drive.errorLink} target="_blank" rel="noopener noreferrer">
                    Activar la API de Google Drive
                  </a>
                  <div className="tiny muted mt8">Luego vuelve aquí y pulsa «Copiar ahora».</div>
                </div>
              )}
            </div>
          ) : drive.last ? (
            <span className="muted">
              ✓ Última copia {when(drive.last)}
              {drive.copies ? ` · ${drive.copies === 1 ? '1 copia' : `${drive.copies} copias`} en tu Drive` : ''}
            </span>
          ) : !hasScope(DRIVE_SCOPE) ? (
            <span style={{ color: 'var(--warning)' }}>Falta dar permiso a Google Drive: pulsa «Copiar ahora».</span>
          ) : (
            <span className="muted">Aún no hay ninguna copia en Drive.</span>
          )}
        </div>
      )}
      {clientId && (
        <div className="btn-row">
          {drive?.on && (
            <button className="btn secondary small" disabled={running} onClick={() => void runDriveBackup({ manual: true })}>
              <CloudUpload size={16} /> Copiar ahora
            </button>
          )}
          <button className="btn secondary small" onClick={startDriveRestore}>
            <CloudDownload size={16} /> Recuperar de Drive
          </button>
        </div>
      )}
    </div>
  );
}

function BackupCard() {
  const state = useApp();
  const input = useRef<HTMLInputElement>(null);
  const last = state.settings.lastBackup;
  return (
    <div className="card mt12">
      <p className="small muted" style={{ marginTop: 0 }}>
        También puedes guardar tú una copia en un archivo (en Archivos, en el ordenador…) y restaurarla en otro móvil.
      </p>
      <div className="btn-row">
        <button className="btn secondary small" onClick={() => void exportBackup()}>
          <Download size={16} /> Descargar copia
        </button>
        <button className="btn secondary small" onClick={() => input.current?.click()}>
          <Upload size={16} /> Restaurar
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const ok = await confirmDialog({ title: '¿Restaurar esta copia?', message: 'Se sustituirá todo lo que hay ahora en la app por la copia.', confirm: 'Restaurar', danger: true });
          if (!ok) return;
          try {
            const r = await importBackup(f);
            toast(`Copia restaurada: ${r.areas} áreas, ${r.entries} elementos, ${r.docs} archivos`);
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      />
      <p className="hint">{last ? `Última copia: ${formatRelative(toISODate(new Date(last))).toLowerCase()}.` : 'Aún no has hecho ninguna copia.'}</p>
    </div>
  );
}

function AboutCard() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    void requestPersistence().then(setPersisted);
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB usados`);
    });
  }, []);
  return (
    <div className="card small">
      <div className="hstack">
        <Smartphone size={16} />
        <span className="grow">Día a Día · versión {__BUILD_ID__}</span>
      </div>
      <p className="muted">
        Todo se guarda en este dispositivo{persisted === null ? '' : persisted ? ' (protegido contra borrados automáticos)' : ''}. {usage}
      </p>
      <button
        className="link-btn"
        style={{ color: 'var(--danger)' }}
        onClick={async () => {
          const ok = await confirmDialog({
            title: '¿Borrar todos los datos?',
            message: 'Se borrará todo lo de la app en este móvil: áreas, recordatorios, cumpleaños y documentos. Haz antes una copia.',
            confirm: 'Borrar todo',
            danger: true,
          });
          if (!ok) return;
          clearToken();
          replaceState(createInitialState());
          await kv.set('state', createInitialState());
          location.hash = '#/hoy';
        }}
      >
        Borrar todos los datos
      </button>
    </div>
  );
}

function HomeShareCard() {
  const state = useApp();
  const [open, setOpen] = useState(false);
  const share = state.share;
  return (
    <div className="card">
      <p className="small muted" style={{ marginTop: 0 }}>
        {share
          ? share.error ??
            `Compartís la compra, las tareas de casa, la cuenta conjunta y los planes en pareja.${share.lastSync ? ` Última sincronización: ${new Date(share.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.` : ''}`
          : 'Comparte con tu pareja la lista de la compra, las tareas de casa, la cuenta conjunta y los planes: lo que uno apunta, el otro lo ve.'}
      </p>
      <button className="btn secondary small" onClick={() => setOpen(true)}>
        <Users size={16} /> {share ? 'Código para tu pareja y opciones' : 'Configurar hogar compartido'}
      </button>
      {open && <HomeShareSheet onClose={() => setOpen(false)} />}
    </div>
  );
}
