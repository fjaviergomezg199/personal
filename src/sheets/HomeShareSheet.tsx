import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, Segmented, Sheet, toast } from '../components/ui';
import { copyText, shareText } from '../lib/files';
import { appsScriptCode } from '../lib/shareScript';
import { fetchSharedItems, makeJoinCode, newShareKey, readJoinCode, SHARE_URL_RE, ShareError, syncShare } from '../lib/shareSync';
import { addArea, getState, setShare, useApp } from '../store/store';
import type { ShareConfig } from '../store/types';

const DRAFT_KEY = 'diaadia:shareKeyDraft';

/** La clave se guarda mientras se configura: al ir a Google la app puede cerrarse. */
function draftKey(): string {
  try {
    const k = localStorage.getItem(DRAFT_KEY);
    if (k) return k;
    const n = newShareKey();
    localStorage.setItem(DRAFT_KEY, n);
    return n;
  } catch {
    return newShareKey();
  }
}

async function connect(cfg: Pick<ShareConfig, 'url' | 'key' | 'name'>): Promise<string | null> {
  try {
    await fetchSharedItems(cfg);
  } catch (err) {
    return err instanceof ShareError ? err.message : 'No se pudo conectar.';
  }
  setShare({ ...cfg });
  // Para ver la lista hace falta un área con la compra: si no hay ninguna, se crea «Hogar».
  if (!getState().areas.some((a) => a.modules.includes('shopping'))) addArea('home');
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nada */
  }
  await syncShare();
  return null;
}

export function HomeShareSheet({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const share = state.share;
  const [mode, setMode] = useState<'create' | 'join'>('create');
  return (
    <Sheet open onClose={onClose} full title="Hogar compartido">
      {share ? (
        <Manage share={share} onClose={onClose} />
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            La lista de la compra y las tareas de casa se guardan en una hoja de cálculo de Google vuestra, y los dos móviles la usan. Lo configura{' '}
            <b>uno de los dos</b> (mejor desde el ordenador) y el otro se une con un código.
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
      )}
    </Sheet>
  );
}

function Create() {
  const [key] = useState(draftKey);
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
  const cfg = readJoinCode(text);
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

function Manage({ share, onClose }: { share: ShareConfig; onClose: () => void }) {
  const code = makeJoinCode(share);
  const message = `Únete a nuestro hogar en Día a Día: abre la app → Ajustes → «Configurar hogar compartido» → «Tengo un código» y pega esto:\n\n${code}`;
  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 700 }}>✓ {share.name} compartido</div>
        <div className="small muted mt8">
          {share.error
            ? share.error
            : share.lastSync
              ? `Última sincronización: ${new Date(share.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
              : 'Conectando…'}
        </div>
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
      <button
        className="link-btn mt16"
        style={{ color: 'var(--danger)' }}
        onClick={async () => {
          const ok = await confirmDialog({
            title: '¿Dejar de compartir?',
            message: 'En este móvil la lista se queda como está, pero dejará de sincronizarse. La hoja de Google no se borra.',
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
    </div>
  );
}
