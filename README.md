# Día a Día 📅

Organizador de la vida para el móvil: agenda semanal, recordatorios con aviso, cumpleaños, planes y entradas de conciertos, y **áreas** que cada uno se monta a su medida (estudios, running, CrossFit, nutrición, trabajo…). Muy sencillo de usar y conectable con **Google Calendar**.

Es una *app web instalable* (PWA): se abre desde un enlace, se añade a la pantalla de inicio del iPhone o Android y funciona como una app normal, también sin conexión. **Cada persona tiene la suya**: los datos se guardan en su propio móvil.

---

## Qué tiene

| Pantalla | Para qué |
|---|---|
| **Hoy** | Lo de hoy de un vistazo: agenda, sesiones de tus áreas (estudio, carrera, WOD), menú del día, objetivos, pendientes, cumpleaños y lo que viene. |
| **Agenda** | Tu semana día a día, la lista de lo próximo (3 meses) y los cumpleaños con cuántos años cumplen. |
| **＋** | Añadir escribiendo como hablas (ver abajo). |
| **Áreas** | Cada parte de tu vida con sus bloques. Se añaden y se quitan cuando quieras. |
| **Ajustes** | Avisos, Google Calendar, copia de seguridad, tema claro/oscuro. |

### Añadir en una frase

Pulsa **＋** y escribe, la app entiende la fecha, la hora, si se repite y de qué tipo es:

- `mañana a las 10 dentista` → plan mañana 10:00 con aviso 1 h antes
- `cumple de Marta 12/03` → cumpleaños (con el año, te dice cuántos cumple)
- `entradas Rosalía viernes 10:00` → recordatorio con aviso 10 min antes (y puedes guardar el enlace de la web de entradas)
- `todos los lunes 9:00 reunión academia` → se repite cada semana
- `pagar el alquiler el día 1 de cada mes`, `en 20 minutos sacar la ropa`, `esta tarde llamar a mamá`, `comprar pan`…

### Áreas y sus bloques

Plantillas listas para usar (se pueden cambiar los bloques de cada área):

- 📚 **Estudios** (p. ej. Historia del Arte): plan de estudio día a día, entregas y exámenes, documentos (PDF y artefactos de Claude), objetivos y notas.
- 🏃 **Running**: entrenamientos sesión a sesión, con lo que has hecho («6,2 km en 37:10»).
- 🏋️ **CrossFit**: pega el WOD del box y, con tus **RM** apuntados, la app pone los kilos al lado de cada porcentaje: `Deadlift 4x3 @80%` → **112,5 kg**. Tabla de porcentajes y discos por lado.
- 🥗 **Nutrición**: menú semanal (lo de hoy sale en Hoy), indicaciones de la nutri y lista de la compra.
- 💼 **Trabajo** (Academia, Ministerio…): pendientes, objetivos de la semana, notas y documentos.
- 🏠 **Casa** u **otra área** en blanco.

**Planificaciones hechas con Claude**: en el área, «Importar de Claude» te da un mensaje para copiar y pegar en tu chat de Claude; Claude te devuelve la planificación en el formato de la app, la pegas y queda repartida por días. También acepta texto normal («26/10 | Rodaje 6 km», «Semana 1 – Lunes: …», tablas).

**Documentos**: sube el PDF o el artefacto HTML que te haya generado Claude (se ven dentro de la app, también sin conexión), guarda enlaces (p. ej. de un artefacto de claude.ai) o pega texto con formato.

---

## Ponerla en marcha (una vez)

### 1. Publicarla en internet (gratis)

La app es una web estática: hay que publicarla en algún sitio para abrirla desde el móvil. Dos opciones:

**A) GitHub Pages** (lo más directo; el repositorio tiene que ser público — el código no tiene ningún dato vuestro, los datos viven en cada móvil):
1. En GitHub: *Settings → General → Change visibility → Public*.
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Llevar estos cambios a `main` (fusionando la rama). El flujo `Comprobar y publicar` la publica en
   `https://fjaviergomezg199.github.io/personal/`.

**B) Mantener el repositorio privado**: conectarlo gratis a [Netlify](https://app.netlify.com), [Vercel](https://vercel.com/new) o [Cloudflare Pages](https://pages.cloudflare.com) («Import from GitHub»). Comando de build `npm run build`, carpeta `dist`. Se vuelve a publicar sola en cada cambio.

### 2. Instalarla en el móvil (cada uno en el suyo)

- **iPhone**: abre el enlace en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**. Ábrela siempre desde el icono (en iPhone los avisos solo funcionan así).
- **Android**: abre el enlace en **Chrome** → menú **⋮** → **Instalar aplicación**. Además podrás *Compartir → Día a Día* un WOD o un texto desde otras apps.

La primera vez pregunta el nombre y qué áreas quieres. Cada uno tendrá su app con sus cosas.

### 3. Conectar Google Calendar (opcional, recomendado)

Sirve para ver vuestros eventos de Google en la agenda y, sobre todo, para que **los avisos lleguen siempre** (los recordatorios se guardan en Google Calendar con su aviso y os avisa la app de Google Calendar del móvil).

Se hace una sola vez en [Google Cloud Console](https://console.cloud.google.com) (~5 minutos; los pasos también están dentro de la app, en *Ajustes → Google Calendar*, con las direcciones exactas para copiar):

1. Crear un proyecto (p. ej. «Día a Día») y **habilitar Google Calendar API**.
2. **Google Auth Platform → Comenzar**: nombre de la app, vuestro correo, tipo *Externo*.
3. **Público → Publicar app** (pasar a producción). Así el permiso no caduca cada 7 días. No hace falta verificarla: al conectar, Google avisa de que no está verificada → *Configuración avanzada* → *Ir a Día a Día*.
4. **Clientes → Crear cliente → Aplicación web** con:
   - *Orígenes autorizados de JavaScript*: `https://fjaviergomezg199.github.io`
   - *URIs de redirección autorizados*: `https://fjaviergomezg199.github.io/personal/`
   (si la publicáis en otro sitio, las direcciones que salen en Ajustes).
5. Copiar el **ID de cliente** y pegarlo en *Ajustes → Google Calendar* de cada móvil. Los dos podéis usar el mismo.
   Opcional: guardarlo como variable `VITE_GOOGLE_CLIENT_ID` del repositorio (*Settings → Secrets and variables → Actions → Variables*) y la app ya vendrá configurada.

> Google da permisos de una hora a las apps web sin servidor. Cuando hay algo pendiente de enviar, la app lo renueva sola con un rebote rápido a Google (se puede desactivar en Ajustes). Si no, verás un aviso «cambios sin enviar» con un botón.

---

## Cómo funcionan los avisos

- **Con Google Calendar conectado**: cada recordatorio, plan o cumpleaños se guarda en vuestro calendario con su aviso → avisa siempre, aunque no abráis la app.
- **Sin Google**: la app avisa cuando está abierta o al volver a ella (activa los avisos en *Ajustes → Avisos*). Las apps web no pueden programar avisos con la app cerrada sin un servidor.
- Para un aviso suelto sin Google, en cada recordatorio hay «Añadir a Google Calendar» (enlace) y «Calendario del móvil (.ics)».

## Lo de Strive (CrossFit)

La app de vuestro box (por lo que parece, **Strivee**) no tiene una API pública para leer los entrenamientos desde otra app. Lo práctico: copiar el WOD y pegarlo en el área de CrossFit («Pegar WOD»). En Android también podéis usar *Compartir → Día a Día*. Si pega varios días a la vez («Lunes…», «Martes…»), crea una sesión por día.

## Privacidad y copias

- Todo se guarda en el propio móvil (IndexedDB). Nada se envía a ningún servidor salvo a Google Calendar si lo conectáis.
- *Ajustes → Copia de seguridad* descarga un fichero con todo (incluidos los PDF). Se restaura desde Ajustes o desde la pantalla de bienvenida (útil al cambiar de móvil).

---

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas (fechas, frases, importadores, RM, Google, avisos…)
npm run build      # genera dist/ (incluye el service worker para usarla sin conexión)
```

Hecho con React + TypeScript + Vite, sin servidor. Estructura:

- `src/screens/` — Hoy, Agenda, Áreas, Ajustes, bienvenida.
- `src/modules/` — bloques de las áreas (plan, pendientes, objetivos, documentos, menú, RM, notas).
- `src/sheets/` — hojas de añadir y editar.
- `src/lib/` — lógica: `quickParse` (frases en español), `importers` (planes y menús de Claude), `lifts` (porcentajes), `google`/`sync` (Google Calendar), `notify` (avisos), `ics`, `backup`.
- `src/store/` — datos y guardado local.
