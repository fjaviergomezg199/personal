/**
 * Código de Google Apps Script que convierte una hoja de cálculo de Google en
 * el «servidor» del hogar compartido. Se pega en Extensiones → Apps Script y
 * se publica como aplicación web. La clave va dentro del código.
 */
export function appsScriptCode(key: string): string {
  return `// Día a Día · Hogar compartido
// Lista de la compra y tareas de casa compartidas entre vuestros móviles.
// No cambies nada: pega todo esto en Extensiones → Apps Script y guarda.

const CLAVE = '${key}';
const HOJA = 'Lista';
const COLUMNAS = ['id', 'lista', 'texto', 'cantidad', 'hecho', 'actualizado', 'por', 'borrado'];

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.getRange('A:D').setNumberFormat('@');
    hoja.getRange('G:G').setNumberFormat('@');
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function texto_(valor) {
  const s = valor === undefined || valor === null ? '' : String(valor);
  return /^[=+\\-@]/.test(s) ? "'" + s : s;
}

function siNo_(valor) {
  return valor === true || valor === 'TRUE' || valor === 'true';
}

function leer_(hoja) {
  const filas = hoja.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0]) continue;
    items.push({
      id: String(f[0]),
      list: String(f[1]),
      text: String(f[2]),
      qty: f[3] === '' || f[3] === null ? undefined : String(f[3]),
      done: siNo_(f[4]),
      updatedAt: Number(f[5]) || 0,
      by: f[6] ? String(f[6]) : undefined,
      deleted: siNo_(f[7]),
    });
  }
  return items;
}

function respuesta_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.clave !== CLAVE) return respuesta_({ ok: false, error: 'clave' });
  return respuesta_({ ok: true, items: leer_(hoja_()), ahora: Date.now() });
}

function doPost(e) {
  let cuerpo;
  try {
    cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuesta_({ ok: false, error: 'json' });
  }
  if (!cuerpo || cuerpo.clave !== CLAVE) return respuesta_({ ok: false, error: 'clave' });
  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(20000);
  try {
    const hoja = hoja_();
    const filas = hoja.getDataRange().getValues();
    const fila = {};
    for (let i = 1; i < filas.length; i++) fila[String(filas[i][0])] = i;
    const cambios = cuerpo.cambios || [];
    for (let c = 0; c < cambios.length; c++) {
      const it = cambios[c];
      if (!it || !it.id) continue;
      const valores = [
        texto_(it.id),
        texto_(it.list),
        texto_(it.text),
        texto_(it.qty),
        !!it.done,
        Number(it.updatedAt) || Date.now(),
        texto_(it.by),
        !!it.deleted,
      ];
      const i = fila[String(it.id)];
      if (i === undefined) {
        hoja.appendRow(valores);
        filas.push(valores);
        fila[String(it.id)] = filas.length - 1;
      } else if (valores[5] >= (Number(filas[i][5]) || 0)) {
        hoja.getRange(i + 1, 1, 1, valores.length).setValues([valores]);
        filas[i] = valores;
      }
    }
    // Lo borrado hace más de 30 días ya no hace falta.
    const limite = Date.now() - 30 * 86400000;
    for (let i = filas.length - 1; i >= 1; i--) {
      if (siNo_(filas[i][7]) && Number(filas[i][5]) < limite) hoja.deleteRow(i + 1);
    }
  } finally {
    cerrojo.releaseLock();
  }
  return respuesta_({ ok: true, items: leer_(hoja_()), ahora: Date.now() });
}
`;
}
