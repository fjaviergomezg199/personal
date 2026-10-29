# Día a Día 📅

Una agenda para el móvil: **el día, la semana y el mes de un vistazo**, cada cosa del color de su categoría. Se apunta escribiendo como hablas, las categorías las creas tú al guardar (`#2sigma`, `#running`…) y los planes largos —un plan de entrenos, de estudio— entran de una vez desde un **JSON**. Con **hábitos** y conectable con **Google Calendar**.

Es una *app web instalable* (PWA): se abre desde un enlace, se añade a la pantalla de inicio del iPhone o Android y funciona como una app normal, también sin conexión. **Cada persona tiene la suya**: los datos se guardan en su propio móvil.

---

## Qué tiene

| Pantalla | Para qué |
|---|---|
| **Hoy** | Arriba, **📌 Pendientes**: lo apuntado sin día (una llamada, algo para leer…) y lo que se quedó sin hacer de otros días, a la vista hasta que se hace; se ven tres y «Ver todas», con la primera línea de las notas. **«Mover»** lo pasa de un toque a hoy, mañana, otro día de la semana (diciendo lo que ya tiene cada uno), otro del calendario o lo deja sin día. Debajo, tu día en una lista: lo que ya pasó en una línea, la hora de ahora y lo que viene. Luego, los hábitos (se marcan con un toque) y lo de mañana. |
| **Calendario** | **Mes, Semana y Día.** En el mes, cada día con sus cosas en chips de colores (lo de varios días, como una barra); al tocar un día ves su lista debajo y, al volver a tocarlo, el día entero. La semana es una lista: los 7 días, cada uno con sus cosas una detrás de otra (con su hora solo si la tienen) y un ＋ para añadir en ese día; los días sin nada ocupan una línea. El día, igual. Se desliza a los lados para cambiar de mes, semana o día, y arriba se ven u ocultan las categorías. |
| **＋** | Añadir escribiendo o dictando como hablas (ver abajo). En el calendario, añade en el día que estás viendo. |
| **Hábitos** | Los de hoy para marcar, cómo vas (racha, % y el historial de las últimas semanas) y crear o cambiar hábitos. |
| **Ajustes** | Categorías, importar al calendario, cumpleaños, avisos, Google Calendar, copia de seguridad y apariencia. |

### Añadir en una frase

Pulsa **＋** y escribe; la app entiende la fecha, la hora, si se repite y de qué tipo es (plan, tarea o recordatorio):

- `mañana a las 10 dentista` → plan mañana 10:00 con aviso 1 h antes
- `#2sigma reunión el lunes a las 9` → plan en la categoría **2sigma** (si no existe, se crea al guardar, con un color libre)
- `#running rodaje 6 km jueves 19:00` → en **Running**, de su color
- `Finde en Jaca del 13 al 15 de noviembre` → un plan de tres días (también `13-15 nov`, `del 30 al 2 de diciembre`, `de viernes a domingo`); sale cada día y, en el mes, como una barra
- `cumple de Marta 12/03` → cumpleaños (con el año, te dice cuántos cumple)
- `todos los lunes 9:00 clase de inglés` → se repite cada semana
- `Pendiente llamada de Fulanito` → a **📌 Pendientes**, sin día (también `Tengo pendiente…`, `Pendientes: …` o empezando por 📌; lo que se escribe sin día va ahí igual)
- `pagar el alquiler el día 1 de cada mes`, `en 20 minutos sacar la ropa`, `llamar al banco`…

Debajo de la frase se ve cómo se va a guardar y se puede cambiar todo: tipo, categoría (o «＋ Nueva»), fecha, hora, «＋ Varios días» (desde y hasta), aviso, si se repite, lugar, enlace y notas.

**Dictar:** el 🎤 junto al cuadro (o el de la barra de Hoy, que abre «Añadir» ya escuchando) escribe lo que dices mientras hablas y para solo al callarte; lo dicho va detrás de lo que ya hubiera escrito (escribe `#2sigma` y dicta el resto). Sale donde el navegador sabe dictar (Android, Safari…). En la app instalada en el iPhone, Apple puede no dejar (o parece que escucha pero no entiende nada): entonces avisa de usar el micrófono del teclado y el botón deja de salir en ese móvil hasta que se actualice.

### Categorías

Trabajo, 2Sigma, Running, Estudios, Casa… las que quieras, cada una con su **color** (9 a elegir, con buen contraste en claro y en oscuro) y, si quieres, un emoji. Se crean al guardar algo (con `#nombre` o con «＋ Nueva») o en *Ajustes → Categorías*, donde también se renombran, se cambian de color, se ordenan y se borran (lo que tenían se queda en el calendario, sin categoría, y se puede deshacer). Con Google Calendar conectado, lo que se envía sale allí de un color parecido.

### Importar al calendario (un plan en JSON)

*Ajustes → Importar al calendario* (o el atajo «Importar» del icono). Se pega el JSON (o se elige el fichero), se ve cómo queda y se importa todo de una vez. Cada importación se puede **deshacer** entera, desde el aviso o desde Ajustes. Lo de un plan no se arrastra: si una sesión no se hace, se queda en su día (no pasa a «de otros días»).

Si no tienes el JSON, pídeselo a ChatGPT o a Claude: el botón *Copiar instrucciones* copia lo que hay que pedirles, con la fecha de inicio. El formato:

```json
[
  {"fecha": "2026-11-02", "hora": "19:00", "duracion": 45, "titulo": "Rodaje suave 6 km",
   "detalle": "Ritmo 6:15/km\nEstiramientos al acabar", "categoria": "Running", "tipo": "tarea"},
  {"fecha": "2026-11-04", "hora": "18:30", "horaFin": "20:00", "titulo": "Clase", "categoria": "2Sigma",
   "tipo": "evento", "lugar": "Academia"}
]
```

- Solo hacen falta **fecha** y **título**. Lo demás es opcional: `hora`, `horaFin` o `duracion` (minutos), `detalle`, `categoria` (si no existe se crea; si no viene, eliges una al importar), `tipo` (`tarea` para marcar como hecha, `evento` para una cita, `recordatorio`) y `lugar`.
- También vale con **días relativos**: `{"semana": 2, "dia": "jueves", ...}` o `{"dia": 3, ...}`, o semanas con sus sesiones dentro (`{"plan": [{"semana": 1, "categoria": "Running", "sesiones": [{"dia": "lunes", "titulo": "Rodaje 5 km"}]}]}`). Entonces la app pregunta qué día empieza.
- Las claves pueden ir en español o en inglés (`date`, `time`, `title`, `category`…), y también entiende una lista o una tabla de texto (`Lunes 2/11 | 19:00 | Rodaje`).

### Hábitos

Beber agua, leer, estirar… cada uno con sus días, su objetivo (veces o vasos al día) y su color. Se marcan con un toque en *Hoy* o en *Hábitos*. La racha tiene **comodín**: un día fallado de vez en cuando no la rompe.

### Buscar y atajos

La 🔍 busca en el calendario (también por categoría), los cumpleaños y los hábitos. Manteniendo pulsado el icono de la app: *Añadir*, *Calendario*, *Importar* y *Buscar*. En Android también se puede *Compartir → Día a Día* un texto desde otra app para apuntarlo o importarlo.

---

## Si venías de la versión anterior

Al abrir la versión nueva, la app pasa sola lo que tenías:

- Tus **áreas** con algo apuntado pasan a ser **categorías** (mismo nombre, color y emoji), y lo que tenías en ellas sale de su color en el calendario.
- Los **planes** de las áreas (entrenos, temas de estudio…) pasan a ser **tareas del calendario** en su día y su categoría, con el detalle y el resultado en las notas. Cada plan sale en *Ajustes → Importar al calendario* (p. ej. «Entrenamientos · Running»), así que, si ya no lo quieres, se quita entero de un toque.
- Hábitos, cumpleaños, la conexión con Google y la copia en Drive siguen igual.
- Lo que ya no está (peso, nutrición y menús, CrossFit, finanzas, listas, documentos, objetivos y el hogar compartido) **no se borra**: se guarda aparte en el móvil una sola vez, por si hiciera falta recuperarlo.

---

## Ponerla en marcha (una vez)

### 1. Publicarla en internet (gratis)

La app es una web estática: hay que publicarla en algún sitio para abrirla desde el móvil. Dos opciones:

**A) GitHub Pages** (lo más directo; el repositorio tiene que ser público — el código no tiene ningún dato vuestro, los datos viven en cada móvil):
1. En GitHub: *Settings → General → Change visibility → Public*.
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Llevar los cambios a `main`. El flujo `Comprobar y publicar` la publica en
   `https://fjaviergomezg199.github.io/personal/`.

**B) Mantener el repositorio privado**: conectarlo gratis a [Netlify](https://app.netlify.com), [Vercel](https://vercel.com/new) o [Cloudflare Pages](https://pages.cloudflare.com) («Import from GitHub»). Comando de build `npm run build`, carpeta `dist`. Se vuelve a publicar sola en cada cambio.

### 2. Instalarla en el móvil (cada uno en el suyo)

- **iPhone**: abre el enlace en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**. Ábrela siempre desde el icono (en iPhone los avisos solo funcionan así).
- **Android**: abre el enlace en **Chrome** → menú **⋮** → **Instalar aplicación**.

La primera vez pregunta el nombre y qué categorías quieres para empezar (se pueden cambiar luego).

### 3. Conectar Google Calendar (opcional, recomendado)

Sirve para ver vuestros eventos de Google en el calendario y, sobre todo, para que **los avisos lleguen siempre** (lo que apuntas se guarda en Google Calendar con su aviso y te avisa la app de Google Calendar del móvil).

Se hace una sola vez en [Google Cloud Console](https://console.cloud.google.com) (~5 minutos; los pasos también están dentro de la app, en *Ajustes → Google Calendar*, con las direcciones exactas para copiar):

1. Crear un proyecto (p. ej. «Día a Día») y **habilitar Google Calendar API** y **Google Drive API** (esta última, para la copia automática).
2. **Google Auth Platform → Comenzar**: nombre de la app, vuestro correo, tipo *Externo*.
3. **Público → Publicar app** (pasar a producción). Así el permiso no caduca cada 7 días. No hace falta verificarla: al conectar, Google avisa de que no está verificada → *Configuración avanzada* → *Ir a Día a Día*.
4. **Clientes → Crear cliente → Aplicación web** con:
   - *Orígenes autorizados de JavaScript*: `https://fjaviergomezg199.github.io`
   - *URIs de redirección autorizados*: `https://fjaviergomezg199.github.io/personal/`
   (si la publicáis en otro sitio, las direcciones que salen en Ajustes).
5. Copiar el **ID de cliente** y pegarlo en *Ajustes → Google Calendar* de cada móvil. Los dos podéis usar el mismo.
   Opcional: guardarlo como variable `VITE_GOOGLE_CLIENT_ID` del repositorio (*Settings → Secrets and variables → Actions → Variables*) y la app ya vendrá configurada.

> Google da permisos de una hora a las apps web sin servidor. Cuando hay algo pendiente de enviar, la app lo renueva sola con un rebote rápido a Google (se puede desactivar en Ajustes). Si no, verás un aviso «cambios sin enviar» con un botón.

### 4. Copia automática en Google Drive (opcional, recomendado)

Con Google conectado, en *Ajustes → Copia de seguridad* activa **«Copia automática en Google Drive»** (Google pedirá permiso para la carpeta de la app). Desde entonces, cada día que haya cambios se guarda una copia en la carpeta **«Día a Día · copias»** de tu Drive (se guardan las 14 últimas). La app solo puede ver lo que ha creado ella, no el resto de tu Drive.

- **Si cambias de móvil**: instala la app y, en la bienvenida, *Recuperar mi copia de Google Drive* (o luego en *Ajustes → Copia de seguridad → Recuperar de Drive*). Eliges la copia y vuelve todo.
- Si sale «Falta activar la API de Google Drive», el botón lleva a la página del proyecto de Google Cloud donde se activa con «Habilitar»; luego, «Copiar ahora».

---

## Cómo funcionan los avisos

- **Con Google Calendar conectado**: cada recordatorio, plan o cumpleaños se guarda en vuestro calendario con su aviso → avisa siempre, aunque no abráis la app.
- **Sin Google**: la app avisa cuando está abierta o al volver a ella (activa los avisos en *Ajustes → Avisos*). Las apps web no pueden programar avisos con la app cerrada sin un servidor.
- Para un aviso suelto sin Google, en cada cosa hay «Añadir a Google Calendar» (enlace) y «Calendario del móvil (.ics)».

## Privacidad y copias

- Todo se guarda en el propio móvil (IndexedDB). Nada se envía a ningún servidor salvo a Google Calendar si lo conectáis y a tu propio Google Drive si activas la copia automática.
- *Ajustes → Copia de seguridad*: la copia automática en Google Drive (ver arriba) y, además, **descargar un fichero** con todo para guardarlo donde quieras. Las dos se recuperan desde Ajustes o desde la pantalla de bienvenida (útil al cambiar de móvil).

---

## Cuentas Claras (finanzas)

En el mismo sitio vive una segunda app, independiente de Día a Día: **Cuentas Claras**, para ingresos, gastos, fijos, ahorro y la previsión mes a mes. El nombre se cambia en *Cuentas → Tus datos* (o tocando el de arriba). Se abre en `https://fjaviergomezg199.github.io/personal/cuentas/` y se instala igual (Safari → Compartir → Añadir a pantalla de inicio).

- Los datos se guardan **solo en el móvil**. En *Cuentas → Tus datos* se descarga una copia de seguridad (guárdala en Archivos o iCloud Drive) y con *Restaurar una copia* se recupera todo, también al cambiar de móvil. La app avisa si pasa un mes sin copia.
- Es una sola página sin build: `public/cuentas/index.html`, con su `manifest.webmanifest`, su `sw.js` (para abrir sin conexión) y sus iconos. El service worker de Día a Día no toca esa carpeta.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas (fechas, frases, calendario, importar, categorías, migración, Google, avisos, hábitos, Drive…)
npm run build      # genera dist/ (incluye el service worker para usarla sin conexión)
```

Hecho con React + TypeScript + Vite, sin servidor. Estructura:

- `src/screens/` — Hoy, Calendario (mes, semana y día), Hábitos, Ajustes (y apariencia), buscador, bienvenida.
- `src/sheets/` — hojas de añadir y editar: añadir rápido, plan/tarea/recordatorio, cumpleaños, categoría, importar.
- `src/components/` — filas de la agenda, selector de categoría, barra inferior, piezas comunes.
- `src/lib/` — lógica: `quickParse` (frases en español y `#categoría`), `dictation` (dictar con el micrófono), `calendar` (cuadrícula del mes y días de la semana), `calendarImport` (JSON, listas y tablas → calendario), `recurrence` (lo que se repite), `colors`, `google`/`sync` (Google Calendar), `notify` (avisos), `ics`, `backup`/`driveBackup` (copias), `habits`, `search`.
- `src/store/` — datos, guardado local y `migrate` (paso de la versión anterior).
