import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from '../components/ui';
import { HOGAR_SERVER } from '../lib/config';
import { copyText } from '../lib/files';
import { serverScriptCode } from '../lib/shareScript';
import { SHARE_URL_RE } from '../lib/shareSync';

/**
 * #/servidor (sin enlace en la app): para quien mantiene la app. Se pone el
 * servidor de hogares una vez y, desde entonces, compartir es pasar un código.
 */
export function ServerSetup() {
  const code = serverScriptCode();
  const [url, setUrl] = useState(HOGAR_SERVER);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = SHARE_URL_RE.test(url.trim());

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      // Un código que no existe: el servidor contesta que no lo conoce (y dice que es el servidor).
      const res = await fetch(`${url.trim()}?clave=PRUEBA0000000&t=${Date.now()}`, { redirect: 'follow', cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; error?: string; servidor?: number };
      if (data.servidor) setResult({ ok: true, text: '✓ Funciona: es el servidor de hogares. Ya se puede poner en la app.' });
      else setResult({ ok: false, text: 'Responde, pero no es el código del servidor (¿es la hoja de un hogar?). Pega el código de esta página.' });
    } catch {
      setResult({ ok: false, text: 'No responde. Revisa que la implementación sea «Aplicación web» con acceso «Cualquier usuario».' });
    }
    setBusy(false);
  };

  return (
    <div className="screen server-setup">
      <div className="screen-header">
        <div>
          <h1>Servidor de hogares</h1>
          <div className="sub">Solo para quien mantiene la app. Se hace una vez, desde el ordenador.</div>
        </div>
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Con el servidor, compartir el hogar es pulsar <b>«Compartir con mi pareja»</b> y pasar un código. Cada hogar tendrá su hoja «Día a Día · Hogar de …» en tu Google
          Drive (como mucho 500 hogares y 40 nuevos al día). El servidor no guarda los códigos, solo su huella.
        </p>
        <ol style={{ marginBottom: 0 }}>
          <li>
            Abre{' '}
            <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer">
              script.google.com → Nuevo proyecto
            </a>{' '}
            y ponle de nombre «Día a Día · Servidor».
          </li>
          <li>
            Borra lo que haya, <b>pega el código</b> de abajo y pulsa <b>Guardar</b> 💾.
          </li>
          <li>
            <b>Implementar → Nueva implementación</b> → en el engranaje ⚙️ elige <b>Aplicación web</b>. «Ejecutar como»: <b>Yo</b>; «Quién tiene acceso»:{' '}
            <b>Cualquier usuario</b>. Pulsa <b>Implementar</b>.
          </li>
          <li>
            <b>Autorizar acceso</b> con tu cuenta. Como el proyecto es tuyo, Google dirá que no está verificado: <b>Configuración avanzada → Ir a Día a Día · Servidor →
            Permitir</b>.
          </li>
          <li>
            Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>), pruébala aquí abajo y ponla en la app: en <code>src/lib/config.ts</code> o en la variable{' '}
            <code>VITE_HOGAR_SERVER</code> de GitHub.
          </li>
        </ol>
      </div>

      <div className="field mt16">
        <span className="label">Código del servidor</span>
        <div className="code-box" style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre', userSelect: 'text' }}>
          {code}
        </div>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => toast((await copyText(code)) ? 'Código copiado' : 'No se pudo copiar')}>
          <Copy size={17} /> Copiar código
        </button>
      </div>

      <div className="field mt16">
        <label htmlFor="sv-url">Probar la URL de la aplicación web</label>
        <input
          id="sv-url"
          className="input"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
          placeholder="https://script.google.com/macros/s/…/exec"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
        {result && (
          <p className="hint" style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }}>
            {result.text}
          </p>
        )}
        <button className="btn secondary" style={{ alignSelf: 'flex-start' }} disabled={!valid || busy} onClick={test}>
          {busy ? 'Probando…' : 'Probar'}
        </button>
      </div>
      {HOGAR_SERVER && <p className="hint">Esta versión de la app ya usa un servidor: {HOGAR_SERVER}</p>}
    </div>
  );
}
