/**
 * Código de Google Apps Script que convierte una hoja de cálculo de Google en
 * el «servidor» del hogar compartido. Se pega en Extensiones → Apps Script y
 * se publica como aplicación web. La clave va dentro del código.
 */
export function appsScriptCode(key: string): string {
  return `// Día a Día · Hogar compartido (versión 4)
// Lista de la compra, tareas de casa, cuenta conjunta y planes en pareja, compartidos entre vuestros móviles.
// No cambies nada: pega todo esto en Extensiones → Apps Script y guarda.

const CLAVE = '${key}';
const VERSION = 4;
const HOJA = 'Lista';
const COLUMNAS = ['id', 'lista', 'texto', 'cantidad', 'hecho', 'actualizado', 'por', 'borrado'];
// Lo demás va en una hoja por tipo de dato (se pueden mirar, pero mejor no tocarlas a mano).
// Si una versión nueva de la app guarda algo más, su hoja y sus columnas se crean solas:
// no hará falta volver a cambiar este código.
const REGISTROS = {
  Movimientos: ['id', 'fecha', 'importe', 'tipo', 'categoria', 'concepto', 'fijo', 'por', 'actualizado', 'borrado', 'recibido'],
  Fijos: ['id', 'nombre', 'importe', 'tipo', 'categoria', 'dia', 'cada', 'desde', 'saltos', 'activo', 'por', 'actualizado', 'borrado', 'recibido'],
  Cuenta: ['id', 'datos', 'por', 'actualizado', 'borrado', 'recibido'],
  Planes: ['id', 'tipo', 'titulo', 'fecha', 'hora', 'horaFin', 'fechaFin', 'repite', 'repiteHasta', 'lugar', 'enlace', 'notas', 'categoria', 'importante', 'hecho', 'hechoDias', 'aviso', 'por', 'actualizado', 'borrado', 'recibido'],
};
const NOMBRE = /^[A-Z][A-Za-z]{2,30}$/;
const COLUMNA = /^[a-z][A-Za-z]{0,30}$/;
const MAX_HOJAS = 30;
const MAX_COLUMNAS = 26;

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

function guardarLista_(cambios) {
  const hoja = hoja_();
  const filas = hoja.getDataRange().getValues();
  const fila = {};
  for (let i = 1; i < filas.length; i++) fila[String(filas[i][0])] = i;
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
}

// Una hoja de registros empieza por «id» y tiene «recibido» (así no se toca ninguna otra pestaña).
function esRegistro_(cabecera) {
  const cab = (cabecera || []).map(String);
  return cab[0] === 'id' && cab.indexOf('recibido') >= 0;
}

function columnasNuevas_(nombre, lista) {
  if (REGISTROS[nombre]) return REGISTROS[nombre].slice();
  const columnas = ['id'];
  for (let k = 0; k < lista.length; k++) {
    for (const c in lista[k]) if (COLUMNA.test(c) && c !== 'recibido' && columnas.indexOf(c) < 0) columnas.push(c);
  }
  ['actualizado', 'borrado'].forEach(function (c) {
    if (columnas.indexOf(c) < 0) columnas.push(c);
  });
  columnas.push('recibido');
  return columnas.slice(0, MAX_COLUMNAS);
}

function hojaDe_(nombre, lista) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    if (libro.getSheets().length >= MAX_HOJAS) return null;
    hoja = libro.insertSheet(nombre);
    hoja.getRange('A:Z').setNumberFormat('@');
    hoja.appendRow(columnasNuevas_(nombre, lista));
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function leerRegistros_(filas, desde) {
  const cab = filas[0].map(String);
  const iRec = cab.indexOf('recibido');
  const lista = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0]) continue;
    if (desde && (Number(f[iRec]) || 0) <= desde) continue;
    const r = {};
    for (let c = 0; c < cab.length; c++) if (cab[c]) r[cab[c]] = f[c] === undefined || f[c] === null ? '' : String(f[c]);
    lista.push(r);
  }
  return lista;
}

function guardarRegistros_(hoja, lista, ahora) {
  const ancho = hoja.getLastColumn();
  if (!ancho || !esRegistro_(hoja.getRange(1, 1, 1, ancho).getValues()[0])) return;
  const filas = hoja.getDataRange().getValues();
  const cab = filas[0].map(String);
  // Datos nuevos de una versión nueva de la app: columnas al final.
  let nuevas = false;
  for (let k = 0; k < lista.length; k++) {
    for (const c in lista[k]) {
      if (COLUMNA.test(c) && cab.indexOf(c) < 0 && cab.length < MAX_COLUMNAS) {
        cab.push(c);
        nuevas = true;
      }
    }
  }
  if (nuevas) hoja.getRange(1, 1, 1, cab.length).setValues([cab]);
  const iAct = cab.indexOf('actualizado');
  const iBorr = cab.indexOf('borrado');
  const fila = {};
  for (let i = 1; i < filas.length; i++) fila[String(filas[i][0])] = i;
  for (let k = 0; k < lista.length; k++) {
    const r = lista[k];
    if (!r || !r.id) continue;
    const valores = cab.map(function (c) {
      return c === 'recibido' ? String(ahora) : texto_(r[c]);
    });
    const i = fila[String(r.id)];
    if (i === undefined) {
      hoja.appendRow(valores);
      filas.push(valores);
      fila[String(r.id)] = filas.length - 1;
    } else if ((Number(r.actualizado) || 0) >= (Number(filas[i][iAct]) || 0)) {
      // Gana el cambio más reciente.
      hoja.getRange(i + 1, 1, 1, valores.length).setValues([valores]);
      filas[i] = valores;
    }
  }
  if (iBorr < 0) return;
  const limite = ahora - 30 * 86400000;
  for (let i = filas.length - 1; i >= 1; i--) {
    if (siNo_(filas[i][iBorr]) && (Number(filas[i][iAct]) || 0) < limite) hoja.deleteRow(i + 1);
  }
}

function todo_(desde) {
  const registros = {};
  const hojas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (let h = 0; h < hojas.length; h++) {
    const hoja = hojas[h];
    const nombre = hoja.getName();
    if (nombre === HOJA || !NOMBRE.test(nombre)) continue;
    // Primero solo la cabecera: las pestañas que no son de la app no se leen enteras.
    const ancho = hoja.getLastColumn();
    if (!ancho || !esRegistro_(hoja.getRange(1, 1, 1, ancho).getValues()[0])) continue;
    registros[nombre] = leerRegistros_(hoja.getDataRange().getValues(), desde);
  }
  for (const nombre in REGISTROS) if (!registros[nombre]) registros[nombre] = [];
  return { ok: true, version: VERSION, items: leer_(hoja_()), registros: registros, ahora: Date.now() };
}

function respuesta_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.clave !== CLAVE) return respuesta_({ ok: false, error: 'clave' });
  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(20000);
  try {
    return respuesta_(todo_(Number(e.parameter.desde) || 0));
  } finally {
    cerrojo.releaseLock();
  }
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
    const ahora = Date.now();
    guardarLista_(cuerpo.cambios || []);
    const registros = cuerpo.registros || {};
    for (const nombre in registros) {
      const lista = registros[nombre];
      if (nombre === HOJA || !NOMBRE.test(nombre) || !Array.isArray(lista) || !lista.length) continue;
      const hoja = hojaDe_(nombre, lista);
      if (hoja) guardarRegistros_(hoja, lista, ahora);
    }
    return respuesta_(todo_(Number(cuerpo.desde) || 0));
  } finally {
    cerrojo.releaseLock();
  }
}
`;
}
