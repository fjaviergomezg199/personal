/* Google Drive simulado para las pruebas: lo justo de la API v3 que usa la copia de seguridad. */

interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  content: Blob;
  trashed: boolean;
  modifiedTime: string;
}

type Headers = Record<string, string>;

export function fakeDrive(token = 'TOKEN') {
  const files = new Map<string, StoredFile>();
  const sessions = new Map<string, { meta: Partial<StoredFile>; id?: string }>();
  const calls: string[] = [];
  let seq = 0;
  let failWith: { status: number; body: string } | null = null;

  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const view = (f: StoredFile) => ({ id: f.id, name: f.name, size: String(f.content.size), modifiedTime: f.modifiedTime, appProperties: f.appProperties });
  const save = (meta: Partial<StoredFile>, content: Blob, id?: string): StoredFile => {
    const prev = id ? files.get(id) : undefined;
    const f: StoredFile = {
      id: id ?? `f${++seq}`,
      name: meta.name ?? prev?.name ?? 'sin nombre',
      mimeType: meta.mimeType ?? prev?.mimeType ?? (content.type || 'application/octet-stream'),
      parents: meta.parents ?? prev?.parents ?? [],
      appProperties: meta.appProperties ?? prev?.appProperties ?? {},
      content,
      trashed: false,
      modifiedTime: new Date().toISOString(),
    };
    files.set(f.id, f);
    return f;
  };

  function matches(f: StoredFile, q: string): boolean {
    const prop = /appProperties has \{ key='(\w+)' and value='(\w+)' \}/.exec(q);
    if (prop && f.appProperties[prop[1]] !== prop[2]) return false;
    const mime = /mimeType = '([^']+)'/.exec(q);
    if (mime && f.mimeType !== mime[1]) return false;
    const parent = /'([^']+)' in parents/.exec(q);
    if (parent && !f.parents.includes(parent[1])) return false;
    if (/trashed = false/.test(q) && f.trashed) return false;
    return true;
  }

  async function multipart(body: Blob, contentType: string): Promise<{ meta: Partial<StoredFile>; content: Blob }> {
    const boundary = /boundary=(\S+)/.exec(contentType)![1];
    const text = await body.text();
    const parts = text.split(`--${boundary}`).slice(1, -1);
    const [metaPart, dataPart] = parts.map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    const type = /Content-Type: ([^\r\n]+)/.exec(parts[1])?.[1] ?? '';
    return { meta: JSON.parse(metaPart) as Partial<StoredFile>, content: new Blob([dataPart], { type }) };
  }

  const fetchImpl = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Headers;
    calls.push(`${method} ${u.pathname}${u.searchParams.get('uploadType') ? `?${u.searchParams.get('uploadType')}` : ''}`);
    if (headers.Authorization !== `Bearer ${token}`) return new Response('{"error":"unauth"}', { status: 401 });
    if (failWith) return new Response(failWith.body, { status: failWith.status });
    const path = u.pathname;

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      return json({ files: [...files.values()].filter((f) => matches(f, q)).map(view) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(init.body)) as Partial<StoredFile>;
      return json(view(save(meta, new Blob([]))));
    }
    if (path === '/upload/drive/v3/files' && method === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
      const { meta, content } = await multipart(init.body as Blob, headers['Content-Type']);
      return json(view(save(meta, content)));
    }
    if (path.startsWith('/upload/drive/v3/files') && u.searchParams.get('uploadType') === 'resumable' && (method === 'POST' || method === 'PATCH')) {
      const session = `s${++seq}`;
      sessions.set(session, { meta: JSON.parse(String(init.body)) as Partial<StoredFile>, id: path.split('/')[5] });
      return new Response(null, { status: 200, headers: { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${session}` } });
    }
    if (method === 'PUT' && u.searchParams.get('upload_id')) {
      const s = sessions.get(u.searchParams.get('upload_id')!)!;
      return json(view(save(s.meta, init.body as Blob, s.id)));
    }
    const id = path.split('/')[path.startsWith('/upload') ? 5 : 4];
    const f = files.get(id);
    if (!f) return json({ error: 'notFound' }, 404);
    if (path.startsWith('/upload/drive/v3/files/') && method === 'PATCH') return json(view(save({}, init.body as Blob, id)));
    if (method === 'PATCH') {
      Object.assign(f, JSON.parse(String(init.body)) as Partial<StoredFile>);
      return json(view(f));
    }
    if (method === 'GET' && u.searchParams.get('alt') === 'media') return new Response(f.content, { status: 200 });
    return json({ error: 'unsupported' }, 400);
  };

  return {
    files,
    calls,
    fetchImpl,
    /** Que la API falle (p. ej. sin activar). */
    fail: (status: number, body: string) => void (failWith = { status, body }),
    live: (kind: string) => [...files.values()].filter((f) => !f.trashed && f.appProperties.diaadia === kind),
  };
}
