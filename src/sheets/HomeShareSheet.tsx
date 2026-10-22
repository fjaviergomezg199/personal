import { ChevronLeft, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, Segmented, Sheet, toast } from '../components/ui';
import { HOGAR_SERVER } from '../lib/config';
import { copyText, shareText } from '../lib/files';
import { appBaseUrl } from '../lib/google';
import { PLANS_SCRIPT } from '../lib/planSync';
import { appsScriptCode } from '../lib/shareScript';
import {
  createHome,
  fetchSharedItems,
  formatHomeCode,
  makeJoinCode,
  newHomeCode,
  newShareKey,
  readHomeCode,
  readJoinCode,
  SHARE_URL_RE,
  ShareError,
  syncShare,
} from '../lib/shareSync';
import { addArea, getState, setShare, useApp } from '../store/store';
import type { ShareConfig } from '../store/types';

const DRAFT_KEY = 'diaadia:shareKeyDraft';
const HOME_DRAFT_KEY = 'diaadia:homeCodeDraft';

/** Se guarda mientras se configura: si algo se corta a medias, se sigue con la misma clave. */
function draft(key: string, make: () => string): string {
  try {
    const k = localStorage.getItem(key);
    if (k) return k;
    const n = make();
    localStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}

function clearDrafts() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(HOME_DRAFT_KEY);
  } catch {
    /* nada */
  }
}

/** Empieza a compartir: lo de este móvil sube y se recibe lo del hogar. */
async function begin(cfg: ShareConfig) {
  setShare({ ...cfg });
  // Para ver la lista hace falta un área con la compra: si no hay ninguna, se crea «Hogar».
  if (!getState().areas.some((a) => a.modules.includes('shopping'))) addArea('home');
  clearDrafts();
  await syncShare();
}

async function connect(cfg: ShareConfig): Promise<string | null> {
  try {
    await fetchSharedItems(cfg);
  } catch (err) {
    if (err instanceof ShareError && err.code === 'key' && cfg.central) return 'Ese código no existe. Revisa que esté bien escrito.';
    return err instanceof ShareError ? err.message : 'No se pudo conectar.';
  }
  await begin(cfg);
  return null;
}

/** Crea el hogar en el servidor de la app con un código nuevo. */
async function startHome(): Promise<string | null> {
  const key = draft(HOME_DRAFT_KEY, newHomeCode);
  try {
    await createHome({ url: HOGAR_SERVER, key }, getState().settings.name.trim());
  } catch (err) {
    return err instanceof ShareError ? err.message : 'No se pudo crear el hogar.';
  }
  await begin({ url: HOGAR_SERVER, key, name: 'Hogar', central: true });
  return null;
}

/** `start="join"`: abre directamente «Tengo un código». */
export function HomeShareSheet({ onClose, start }: { onClose: () => void; start?: 'join' }) {
  const state = useApp();
  const share = state.share;
  const [advanced, setAdvanced] = useState(!HOGAR_SERVER);
  return (
    <Sheet open onClose={onClose} full={!share && advanced} title="Hogar compartido">
      {share ? (
        <Manage share={share} onClose={onClose} />
      ) : advanced ? (
        <Manual onBack={HOGAR_SERVER ? () => setAdvanced(false) : undefined} />
      ) : (
        <Start initial={start} onAdvanced={() => setAdvanced(true)} />
      )}
    </Sheet>
  );
}

/* ---------- Con el servidor de la app: un botón y un código ---------- */

function Start({ initial, onAdvanced }: { initial?: 'join'; onAdvanced: () => void }) {
  const [joining, setJoining] = useState(initial === 'join');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (joining) return <JoinCode onBack={() => setJoining(false)} />;
  return (
    <div className="share-start">
      <div className="share-hero" aria-hidden>
        🏠
      </div>
      <p className="share-lead">La lista de la compra, las tareas de casa, la cuenta conjunta y los planes, en los dos móviles: lo que uno apunta, el otro lo ve.</p>
      <button
        className="btn block share-main"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const err = await startHome();
          setBusy(false);
          if (err) setError(err);
        }}
      >
        {busy ? 'Creando vuestro hogar…' : 'Compartir con mi pareja'}
      </button>
      {error && (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button className="btn secondary block mt12 share-main" onClick={() => setJoining(true)}>
        Tengo un código
      </button>
      <p className="hint center mt16">Se guarda en el servidor de la app, aparte para cada hogar: solo entra quien tiene vuestro código.</p>
      <div className="center">
        <button className="link-btn small" onClick={onAdvanced}>
          Prefiero usar una hoja de Google nuestra (avanzado)
        </button>
      </div>
    </div>
  );
}

function JoinCode({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const home = readHomeCode(text);
  // También vale el código largo de quien comparte con una hoja suya
  const legacy = home ? null : readJoinCode(text);
  const cfg: ShareConfig | null = home && HOGAR_SERVER ? { url: HOGAR_SERVER, key: home, name: 'Hogar', central: true } : legacy;
  const typed = text.replace(/[\s-]/g, '').length;
  return (
    <div>
      <button className="link-btn" style={{ padding: 0 }} onClick={onBack}>
        <ChevronLeft size={16} style={{ verticalAlign: -3 }} /> Volver
      </button>
      <div className="field mt12">
        <label htmlFor="hs-code">El código que te ha pasado tu pareja</label>
        <input
          id="hs-code"
          className="input code-input"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            const compact = v.toUpperCase().replace(/[\s-]/g, '');
            // Una letra de más al escribir no cuenta (pegar un mensaje entero sí vale)
            if (/^[0-9A-Z]{13}$/.test(compact) && v.length === text.length + 1) return;
            // Se escribe solo con sus guiones; si se pega un mensaje entero, se deja tal cual
            setText(/^[0-9A-Z]{0,12}$/.test(compact) ? formatHomeCode(compact) : v);
            setError('');
          }}
          placeholder="XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus
        />
        {!cfg && typed >= 12 && <p className="hint">Ese código no parece bien escrito: son 12 letras y números, como K7P4-QX9M-ZT2W.</p>}
        {error && (
          <p className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
      <button
        className="btn block mt12 share-main"
        disabled={!cfg || busy}
        onClick={async () => {
          if (!cfg) return;
          setBusy(true);
          const err = await connect(cfg);
          setBusy(false);
          if (err) setError(err);
          else toast('¡Ya estáis en el mismo hogar! Lo que apuntéis lo veréis los dos.');
        }}
      >
        {busy ? 'Uniendo…' : 'Unirme'}
      </button>
    </div>
  );
}

/* ---------- Ya compartido ---------- */

function Manage({ share, onClose }: { share: ShareConfig; onClose: () => void }) {
  const status = (
    <div className="small muted mt8">
      {share.error
        ? share.error
        : share.lastSync
          ? `Última sincronización: ${new Date(share.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
          : 'Conectando…'}
    </div>
  );
  const leave = (
    <button
      className="link-btn mt16"
      style={{ color: 'var(--danger)' }}
      onClick={async () => {
        const ok = await confirmDialog({
          title: '¿Dejar de compartir?',
          message: share.central
            ? 'En este móvil todo se queda como está, pero dejará de sincronizarse. Para volver, únete otra vez con el código.'
            : 'En este móvil la lista se queda como está, pero dejará de sincronizarse. La hoja de Google no se borra.',
          confirm: 'Dejar de compartir',
          danger: true,
        });
        if (!ok) return;
        setShare(undefined);
        onClose();
        toast('Ya no se comparte');
      }}
    >
      Dejar de compartir en este móvil
    </button>
  );

  if (share.central) {
    const code = formatHomeCode(share.key);
    const message = `Únete a nuestro hogar en Día a Día 🏠\n\n1. Abre la app (si no la tienes: ${appBaseUrl()})\n2. Ajustes → Hogar compartido → «Tengo un código»\n3. Escribe: ${code}`;
    return (
      <div>
        <div className="card center home-code-card">
          <div className="small muted">Código de vuestro hogar</div>
          <div className="home-code" aria-label={`Código: ${[...share.key].join(' ')}`}>
            {code}
          </div>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button
              className="btn"
              onClick={async () => {
                const r = await shareText(message, 'Hogar compartido');
                if (r === 'copied') toast('Mensaje copiado: pégalo en WhatsApp');
              }}
            >
              <Share2 size={17} /> Enviar a mi pareja
            </button>
            <button className="btn secondary" onClick={async () => toast((await copyText(code)) ? 'Código copiado' : 'No se pudo copiar')}>
              <Copy size={17} /> Copiar
            </button>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            En su móvil: Ajustes → Hogar compartido → «Tengo un código».
          </p>
        </div>
        <div className="card mt12">
          <div style={{ fontWeight: 700 }}>✓ Compartís la compra, las tareas de casa, la cuenta conjunta y los planes</div>
          {status}
        </div>
        <p className="hint">Quien tenga el código ve y cambia lo compartido: dáselo solo a quien viva contigo.</p>
        {leave}
      </div>
    );
  }

  const code = makeJoinCode(share);
  const message = `Únete a nuestro hogar en Día a Día: abre la app → Ajustes → Hogar compartido → «Tengo un código» y pega esto:\n\n${code}`;
  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 700 }}>✓ {share.name} compartido</div>
        {status}
      </div>
      <div className="field mt16">
        <span className="label">Código para tu pareja</span>
        <div className="code-box">{code}</div>
        <div className="btn-row">
          <button className="btn secondary small" onClick={async () => toast((await copyText(code)) ? 'Código copiado' : 'No se pudo copiar')}>
            <Copy size={16} /> Copiar
          </button>
          <button
            className="btn small"
            onClick={async () => {
              const r = await shareText(message, 'Hogar compartido');
              if (r === 'copied') toast('Mensaje copiado');
            }}
          >
            <Share2 size={16} /> Enviar código
          </button>
        </div>
        <p className="hint">Cualquiera con este código puede ver y cambiar la lista: compártelo solo con tu pareja.</p>
      </div>
      <ScriptUpdate share={share} />
      {leave}
    </div>
  );
}

/* ---------- Forma avanzada: una hoja de Google vuestra ---------- */

function Manual({ onBack }: { onBack?: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  return (
    <>
      {onBack && (
        <button className="link-btn" style={{ padding: 0, marginBottom: 8 }} onClick={onBack}>
          <ChevronLeft size={16} style={{ verticalAlign: -3 }} /> Volver
        </button>
      )}
      <p className="muted small" style={{ marginTop: 0 }}>
        Lo compartido se guarda en una hoja de cálculo de Google vuestra, y los dos móviles la usan. Lo configura <b>uno de los dos</b> (mejor desde el ordenador) y el otro se
        une con un código.
      </p>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: 'Configurarlo yo' },
          { value: 'join', label: 'Tengo un código' },
        ]}
      />
      <div className="mt16">{mode === 'create' ? <Create /> : <Join />}</div>
    </>
  );
}

function Create() {
  const [key] = useState(() => draft(DRAFT_KEY, newShareKey));
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const code = appsScriptCode(key);
  const valid = SHARE_URL_RE.test(url.trim());

  return (
    <div>
      <div className="callout">
        <ol style={{ marginTop: 0 }}>
          <li>
            Abre{' '}
            <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">
              sheets.new
            </a>{' '}
            (crea una hoja de cálculo en tu Google Drive) y ponle un nombre, p. ej. «Día a Día · Hogar».
          </li>
          <li>
            Menú <b>Extensiones → Apps Script</b>.
          </li>
          <li>
            Borra lo que haya, <b>pega el código</b> de abajo y pulsa <b>Guardar</b> 💾.
          </li>
          <li>
            <b>Implementar → Nueva implementación</b> → en el engranaje ⚙️ elige <b>Aplicación web</b>. «Ejecutar como»: <b>Yo</b>; «Quién tiene acceso»:{' '}
            <b>Cualquier usuario</b>. Pulsa <b>Implementar</b>.
          </li>
          <li>
            Autoriza el acceso con tu cuenta. Google dirá que la app no está verificada (es tuya): <b>Configuración avanzada → Ir a…</b> →{' '}
            <b>Permitir</b>.
          </li>
          <li>
            Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>) y pégala aquí abajo.
          </li>
        </ol>
      </div>

      <div className="field mt16">
        <span className="label">Código para Apps Script (lleva vuestra clave)</span>
        <div className="code-box" style={{ maxHeight: 120, overflow: 'auto', whiteSpace: 'pre', userSelect: 'text' }}>
          {code}
        </div>
        <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={async () => toast((await copyText(code)) ? 'Código copiado' : 'No se pudo copiar')}>
          <Copy size={16} /> Copiar código
        </button>
      </div>

      <div className="field">
        <label htmlFor="hs-url">URL de la aplicación web</label>
        <input
          id="hs-url"
          className="input"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
          placeholder="https://script.google.com/macros/s/…/exec"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
        {url.trim() && !valid && <p className="hint">Tiene que empezar por https://script.google.com/ y terminar en /exec.</p>}
        {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
      <button
        className="btn block mt12"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          const err = await connect({ url: url.trim(), key, name: 'Hogar' });
          setBusy(false);
          if (err) setError(err);
          else toast('¡Hogar compartido listo! Pásale el código a tu pareja.');
        }}
      >
        {busy ? 'Conectando…' : 'Conectar'}
      </button>
    </div>
  );
}

function Join() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const home = HOGAR_SERVER ? readHomeCode(text) : null;
  const cfg: ShareConfig | null = home ? { url: HOGAR_SERVER, key: home, name: 'Hogar', central: true } : readJoinCode(text);
  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Pídele a quien lo configuró el código (en su app: Ajustes → «Código para tu pareja y opciones» → «Enviar código») y pégalo aquí.
      </p>
      <textarea
        className="textarea mono"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        placeholder="DD1.…"
      />
      {text.trim() && !cfg && <p className="hint">Ese código no parece válido. Cópialo entero.</p>}
      {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
      <button
        className="btn block mt12"
        disabled={!cfg || busy}
        onClick={async () => {
          if (!cfg) return;
          setBusy(true);
          const err = await connect(cfg);
          setBusy(false);
          if (err) setError(err);
          else toast('¡Unido al hogar! Ya veis la misma lista.');
        }}
      >
        {busy ? 'Uniendo…' : 'Unirme'}
      </button>
    </div>
  );
}

/** Para pasar a una versión nueva del código de la hoja (la dirección no cambia). */
function ScriptUpdate({ share }: { share: ShareConfig }) {
  const version = share.scriptVersion ?? PLANS_SCRIPT;
  const old = version < PLANS_SCRIPT;
  const [open, setOpen] = useState(old);
  const code = appsScriptCode(share.key);
  return (
    <div className="card mt16" style={old ? { background: 'var(--warning-soft)' } : undefined}>
      {old ? (
        <>
          <div style={{ fontWeight: 700 }}>Actualiza el código de la hoja</div>
          <p className="small" style={{ margin: '4px 0 0' }}>
            La hoja tiene el código antiguo: la lista funciona, pero para compartir también {version < 3 ? <><b>la cuenta conjunta</b> y </> : ''}
            <b>los planes en pareja</b> hay que poner el nuevo (2 minutos, mejor desde el
            ordenador).
          </p>
        </>
      ) : (
        <button className="link-btn" style={{ padding: 0 }} onClick={() => setOpen(!open)}>
          {open ? 'Ocultar' : 'Ver'} el código de la hoja
        </button>
      )}
      {open && (
        <>
          <ol className="small" style={{ paddingLeft: 20, margin: '10px 0' }}>
            <li>
              Abre vuestra hoja de Google → <b>Extensiones → Apps Script</b>.
            </li>
            <li>
              Borra todo, <b>pega el código</b> de abajo y pulsa <b>Guardar</b> 💾.
            </li>
            <li>
              <b>Implementar → Gestionar implementaciones</b> → lápiz ✏️ → en «Versión» elige <b>Nueva versión</b> → <b>Implementar</b>. La dirección /exec es la misma: no hay que
              tocar nada en los móviles.
            </li>
          </ol>
          <div className="code-box" style={{ maxHeight: 110, overflow: 'auto', whiteSpace: 'pre', userSelect: 'text' }}>
            {code}
          </div>
          <button className="btn secondary small mt8" onClick={async () => toast((await copyText(code)) ? 'Código copiado' : 'No se pudo copiar')}>
            <Copy size={16} /> Copiar código
          </button>
        </>
      )}
    </div>
  );
}
