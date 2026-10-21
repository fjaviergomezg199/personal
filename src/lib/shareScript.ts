/**
 * Código de Google Apps Script que convierte una hoja de cálculo de Google en
 * el «servidor» del hogar compartido. Se pega en Extensiones → Apps Script y
 * se publica como aplicación web. La clave va dentro del código.
 */
export function appsScriptCode(key: string): string {
  return `// Día a Día · Hogar compartido (versión 3)
// Lista de la compra, tareas de casa y cuenta conjunta, compartidas entre vuestros móviles.
// No cambies nada: pega todo esto en Extensiones → Apps Script y guarda.

const CLAVE = '${key}';
const VERSION = 3;
const HOJA = 'Lista';
const COLUMNAS = ['id', 'lista', 'texto', 'cantidad', 'hecho', 'actualizado', 'por', 'borrado'];
// Cuenta conjunta: una hoja por tipo de dato (se pueden mirar, pero mejor no tocarlas a mano).
const REGISTROS = {
  Movimientos: ['id', 'fecha', 'importe', 'tipo', 'categoria', 'concepto', 'fijo', 'por', 'actualizado', 'borrado', 'recibido'],
  Fijos: ['id', 'nombre', 'importe', 'tipo', 'categoria', 'dia', 'cada', 'desde', 'saltos', 'activo', 'por', 'actualizado', 'borrado', 'recibido'],
  Cuenta: ['id', 'datos', 'por', 'actualizado', 'borrado', 'recibido'],
};

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

function hojaDe_(nombre) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
    hoja.getRange('A:Z').setNumberFormat('@');
    hoja.appendRow(REGISTROS[nombre]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function leerRegistros_(nombre, desde) {
  const columnas = REGISTROS[nombre];
  const filas = hojaDe_(nombre).getDataRange().getValues();
  const iRec = columnas.indexOf('recibido');
  const lista = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0]) continue;
    if (desde && (Number(f[iRec]) || 0) <= desde) continue;
    const r = {};
    for (let c = 0; c < columnas.length; c++) r[columnas[c]] = f[c] === undefined || f[c] === null ? '' : String(f[c]);
    lista.push(r);
  }
  return lista;
}

function guardarRegistros_(nombre, lista, ahora) {
  const columnas = REGISTROS[nombre];
  const hoja = hojaDe_(nombre);
  const filas = hoja.getDataRange().getValues();
  const iAct = columnas.indexOf('actualizado');
  const iBorr = columnas.indexOf('borrado');
  const fila = {};
  for (let i = 1; i < filas.length; i++) fila[String(filas[i][0])] = i;
  for (let k = 0; k < lista.length; k++) {
    const r = lista[k];
    if (!r || !r.id) continue;
    const valores = columnas.map(function (c) {
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
  const limite = ahora - 30 * 86400000;
  for (let i = filas.length - 1; i >= 1; i--) {
    if (siNo_(filas[i][iBorr]) && (Number(filas[i][iAct]) || 0) < limite) hoja.deleteRow(i + 1);
  }
}

function todo_(desde) {
  const registros = {};
  for (const nombre in REGISTROS) registros[nombre] = leerRegistros_(nombre, desde);
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
    for (const nombre in REGISTROS) {
      if (Array.isArray(registros[nombre]) && registros[nombre].length) guardarRegistros_(nombre, registros[nombre], ahora);
    }
    return respuesta_(todo_(Number(cuerpo.desde) || 0));
  } finally {
    cerrojo.releaseLock();
  }
}
`;
}
