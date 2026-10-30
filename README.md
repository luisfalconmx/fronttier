# Fronttier

Repositorio: https://github.com/luisfalconmx/fronttier

Navegador para desarrollo web que muestra un mismo sitio en varios dispositivos a la vez. Lo que haces en un panel (scroll, clics, formularios, hover, teclas, navegación) se repite en todos los demás, y trae herramientas de accesibilidad, SEO, rendimiento y depuración integradas.

Escrito desde cero con Electron + TypeScript, sin frameworks de interfaz.

---

## Descargas e instalación

Los instaladores se generan en la carpeta `release/` (ver [Compilar los instaladores](#compilar-los-instaladores)).

| Sistema | Archivo | Cómo instalar |
| --- | --- | --- |
| **Windows 11 (instalador)** | `Fronttier-Setup-1.0.0-win-x64.exe` | Doble clic y sigue el asistente. Se instala **para tu usuario** (no pide permisos de administrador) y crea accesos en el escritorio y el menú Inicio. |
| **Windows (portable)** | `Fronttier-Portable-1.0.0-win-x64.exe` | No se instala: copia el `.exe` a cualquier carpeta o USB y ábrelo. Funciona en equipos **sin permisos de administrador**. Guarda sus datos en una carpeta `FronttierData` junto al `.exe`. |
| **macOS** (Apple Silicon e Intel) | `Fronttier-1.0.0-mac-arm64.dmg` / `Fronttier-1.0.0-mac-x64.dmg` | Abre el `.dmg` y arrastra **Fronttier** a **Aplicaciones**. |
| **Linux** | `Fronttier-1.0.0-linux-x86_64.AppImage` o `Fronttier-1.0.0-linux-amd64.deb` | AppImage: `chmod +x Fronttier-*.AppImage` y ejecútalo. Debian/Ubuntu: `sudo apt install ./Fronttier-*.deb`. |

### Primer arranque: avisos de seguridad

Los instaladores **no tienen firma de desarrollador verificada** (eso requiere certificados de pago de Apple y Microsoft), así que el sistema mostrará un aviso la primera vez:

- **Windows (SmartScreen):** “Windows protegió tu PC” → **Más información** → **Ejecutar de todas formas**.
- **macOS (Gatekeeper):** la app lleva firma ad-hoc pero no está notarizada por Apple, así que la primera vez macOS dice que no pudo verificarla. Pulsa **Listo**, ve a **Ajustes del Sistema → Privacidad y seguridad** y pulsa **Abrir de todos modos** junto a “Se bloqueó Fronttier”. También puedes quitar la cuarentena desde Terminal:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Fronttier.app
  ```

- **Linux (AppImage):** si al hacer doble clic no abre, márcalo como ejecutable (`chmod +x`). Usa un runtime estático, así que no necesita `libfuse2`.

---

## Uso rápido

1. Abre Fronttier, escribe una URL (`localhost:3000`, `mi-sitio.com`…) y pulsa **Enter**.
2. Cada panel es un dispositivo. Usa **+ Panel** para agregar dispositivos, conjuntos de breakpoints (Tailwind, Bootstrap, Material) o tamaños personalizados.
3. Interactúa en cualquier panel: los demás te siguen.
4. Abre las herramientas en la barra lateral derecha (iconos) o con **Ctrl/Cmd + K**.

### Atajos principales

| Acción | macOS | Windows / Linux |
| --- | --- | --- |
| Barra de comandos | ⌘K | Ctrl+K |
| Ir a la dirección | ⌘L | Ctrl+L |
| Recargar todos / vaciar caché | ⌘R / ⇧⌘R | Ctrl+R / Ctrl+Shift+R |
| Recargar solo CSS | ⌥⌘R | Ctrl+Alt+R |
| Nueva pestaña / cerrar / reabrir | ⌘T / ⌘W / ⇧⌘T | Ctrl+T / Ctrl+W / Ctrl+Shift+T |
| Nuevo panel | ⇧⌘N | Ctrl+Shift+N |
| Diseños horizontal / cuadrícula / enfocado / completo | ⌥1 – ⌥4 | Alt+1 – Alt+4 |
| Acercar / alejar / ajustar | ⌘= / ⌘- / ⌘0 | Ctrl+= / Ctrl+- / Ctrl+0 |
| Captura de todos los paneles | ⇧⌘S | Ctrl+Shift+S |
| Grabar video | ⇧⌘E | Ctrl+Shift+E |
| Autocompletar formularios | ⇧⌘F | Ctrl+Shift+F |
| Buscar en la página | ⌘F | Ctrl+F |
| Panel lateral | ⌘\ | Ctrl+\ |
| DevTools de Chromium del panel | F12 | F12 |
| Guardar / restaurar espacio de trabajo 1–5 | ⌥⇧⌘1–5 / ⌥⌘1–5 | Ctrl+Alt+Shift+1–5 / Ctrl+Alt+1–5 |
| **Inspección rápida** | mantener **⌥ Option** | mantener **Alt** |

---

## Funciones

### Paneles y sincronización
- Paneles de cualquier tamaño o de un catálogo de más de 30 dispositivos reales (iPhone, Pixel, Galaxy, iPad, Surface, MacBook, pantallas 4K/5K, ultrawide, TV).
- Conjuntos de breakpoints (Tailwind, Bootstrap, Material) y **creación automática de paneles a partir de los `@media` del CSS** del sitio (rangos o bordes `n-1 / n`).
- Sincronización de **scroll, clics, formularios, foco, envíos, hover, teclas y navegación** (incluidas apps SPA). Cada tipo se puede activar o desactivar.
- Diseños **horizontal, cuadrícula, enfocado y completo**; zoom de la interfaz, ajuste automático a la ventana y zoom de página.
- Redimensionar arrastrando el borde, rotar, renombrar, duplicar, reordenar y tamaños aleatorios.
- Pestañas (las inactivas se descargan para ahorrar memoria), historial, marcadores y **5 espacios de trabajo** guardables.

### Emulación de dispositivos y entorno
- Ancho, alto, **densidad de píxeles (DPR)**, user agent, modo móvil y **eventos táctiles** por panel.
- **Safe-area insets**, notch, Dynamic Island y perforación de cámara, más las **barras del navegador móvil** que reducen el viewport real.
- `prefers-color-scheme` (global o por panel), `prefers-reduced-motion`, `forced-colors`, `prefers-contrast`, `prefers-reduced-data` y medio de impresión.
- Idioma (`navigator.language` y `Accept-Language`), zona horaria, **geolocalización**, **limitación de red** (4G, 3G, sin conexión), **limitación de CPU**, desactivar JavaScript y desactivar caché.

### Portal (dispositivos reales)
- Comparte el sitio de la pestaña actual en tu red local con **código QR**. Teléfonos, tabletas y otros navegadores se sincronizan **en ambos sentidos** (scroll, clics, formularios, navegación).
- Funciona como proxy: reescribe URLs, quita cabeceras que bloquean y deja pasar los WebSockets del servidor de desarrollo (hot reload).
- URL pública opcional mediante [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (si está instalado).

### Herramientas de desarrollo unificadas
- **Elementos:** árbol del DOM. Al seleccionar un nodo se resalta en todos los paneles, y editar atributos, estilos o texto, o eliminar nodos, se aplica en todos a la vez.
- **Consola:** mensajes de todos los paneles agrupados (por ejemplo, “3 paneles”), con filtros, y ejecución de JavaScript en todos los paneles o solo en el seleccionado.
- **Red:** por panel, peticiones, bytes transferidos, DOMContentLoaded, Load y orígenes externos, más el detalle de cada petición.
- **CSS en vivo** inyectado en todos los paneles y **recarga solo de CSS**.
- Acceso directo a las **DevTools de Chromium** de cualquier panel.

### Rendimiento
- **Core Web Vitals** (LCP, CLS, INP, FCP, TTFB) bajo cada panel, con colores según los umbrales de Google.
- Comparación con **datos reales de usuarios (CrUX)** con una clave de API gratuita (Ajustes).
- Medidor de **RAM** de Fronttier en la barra de estado y desglose por proceso.

### SEO y redes sociales
- **Meta:** título y descripción con longitud, canonical, viewport, idioma, robots, favicons, hreflang, Open Graph, Twitter/X, **JSON-LD** (validado), **robots.txt** (indica si la ruta actual está bloqueada y qué sitemaps declara) y **Web App Manifest**. Los problemas se detectan solos.
- **Validación HTML** con el validador del W3C (bajo demanda; envía el DOM a validator.w3.org).
- **Vistas previas sociales:** buscador, X/Twitter, Facebook, LinkedIn, Slack, Discord y WhatsApp.

### Accesibilidad
- **Esquema:** encabezados (con avisos de saltos y vacíos), landmarks y enlaces (sin texto, poco descriptivos, `target=_blank` inseguro, mismo texto con distinto destino) y **búsqueda de enlaces rotos**.
- **Escáner automático WCAG** con axe-core (en español), agrupado por gravedad y con enlace a la explicación.
- **Contraste:** relación WCAG AA/AAA y **APCA** de cada texto, **color sugerido** que cumple AA y marcas sobre la página.
- **Imágenes:** alt faltante, nombre de archivo, “imagen de…”, demasiado largo, imágenes sobredimensionadas, sin `width`/`height` y sin carga diferida.
- **Orden de foco** dibujado sobre la página, con números y líneas.
- **Árbol de accesibilidad** tal como lo recibe un lector de pantalla.
- **Simuladores:** protanopía, deuteranopía, tritanopía, acromatopsia y sus variantes débiles, visión borrosa, contraste reducido, cataratas, glaucoma, degeneración macular, visión de túnel, astigmatismo, dislexia, temblor (objetivos táctiles), pantalla tenue, luz solar directa y luz nocturna.

### Depuración
- **Inspección rápida con Alt/Option:** caja de margen, borde y padding, tamaño, tipografía, colores, contraste, rol y nombre accesible.
- **Desborde horizontal:** aviso bajo cada panel y en la barra de estado, con los elementos culpables resaltados en rojo.
- **Depuración de layout** (contornos por nivel), **reglas** con posición del cursor, **cuadrícula de columnas** configurable e **imagen de referencia** del diseño superpuesta (con opacidad y modo diferencia).
- Desactivar hojas de estilo, ocultar imágenes y mostrar el texto alternativo sobre las imágenes.
- Desactivar **Content-Security-Policy** y permitir **CORS** (solo para desarrollo).
- **Almacenamiento:** localStorage, sessionStorage y cookies; borrar caché, cookies o todo.
- **Modo lectura**, **buscar en todos los paneles** y **recarga automática** cada N segundos.

### Archivos locales
- **Modo local:** sirve cualquier carpeta en `http://localhost:<puerto>` y la abre.
- **Live reload:** vigila una carpeta; los cambios en CSS se aplican sin recargar y los demás recargan los paneles.

### Captura y productividad
- Capturas del **panel, de todos los paneles juntos o de la página completa**, con **editor integrado** (lápiz, resaltador, rectángulo, flecha, texto, pixelar, recortar, deshacer) para guardar en PNG o copiar al portapapeles.
- **Grabación de video** de la ventana (WebM).
- **Autocompletar formularios** con datos de prueba en todos los paneles (correo configurable) y limpiarlos.
- Menú contextual: copiar selector CSS, mostrar en Elementos, copiar enlace como Markdown, copiar enlace a lo resaltado, copiar `<img>` o `background-image`, guardar imagen, ver código fuente e inspeccionar.

---

## Por qué Electron y cómo se mantiene ligero

Las funciones clave (emular DPR, user agent, media features, red, CPU, visión, Core Web Vitals, árbol de accesibilidad) dependen del **protocolo de DevTools de Chromium**. Las alternativas “ligeras”, como Tauri, usan el motor web del sistema (WebKit en macOS y Linux, WebView2 en Windows): no ofrecen esas APIs y renderizarían distinto en cada sistema, algo inaceptable en una herramienta de pruebas. Por eso Fronttier usa Electron y ahorra memoria de otras formas:

- **Los paneles del mismo sitio comparten un solo proceso** (`process-per-site`): con 3 paneles, la RAM bajó de ~790 MB a ~590 MB en las pruebas, y el ahorro crece con cada panel.
- **Las pestañas inactivas se descargan por completo**: solo la pestaña visible tiene paneles vivos.
- Interfaz en TypeScript **sin React ni frameworks** (~125 KB) y **cero dependencias en tiempo de ejecución** (todo se empaqueta con esbuild).
- Sin corrector ortográfico ni procesos de reserva; una sola sesión compartida.
- Opción **“Emular densidad de píxeles”**: desactívala en equipos modestos para renderizar a 1× y gastar menos memoria de GPU.
- La barra de estado muestra la RAM usada en tiempo real.

---

## Desarrollo

Requisitos: **Node.js 22 o 24** y npm.

```bash
npm install
```

```bash
npm start
```

| Script | Qué hace |
| --- | --- |
| `npm start` | Compila y abre la app. |
| `npm run dev` | Igual, con source maps y sin minificar. |
| `npm run typecheck` | Verificación de tipos con TypeScript. |
| `npm run icon` | Regenera `build/icon.png`. |

### Compilar los instaladores

```bash
npm run dist:win
```

```bash
npm run dist:mac
```

```bash
npm run dist:linux
```

Los archivos quedan en `release/`. Notas:

- Lo más fiable es compilar cada sistema **en ese mismo sistema**. El workflow `.github/workflows/release.yml` lo hace solo en GitHub Actions al publicar una etiqueta `v*` (o manualmente desde la pestaña *Actions*) y deja los cuatro artefactos descargables.
- Desde macOS (incluido Apple Silicon) se generan también los de Windows y Linux, sin Wine ni Rosetta, gracias a los toolsets nativos configurados en `package.json` (`build.toolsets`). En ese caso el `.exe` no lleva incrustado el ícono ni los metadatos de versión (`signAndEditExecutable: false`), porque eso requiere herramientas de Windows; si quieres incluirlos, compila en Windows o con el workflow.

### Estructura

```
src/
  main/       Proceso principal: ventana, menú, CDP (emulación y red), Portal, modo local
  preload/    Puentes seguros: shell.ts (interfaz) y pane.ts (dentro de cada panel)
  pane/       Código que corre dentro de cada página: auditorías, overlays, inspector, simuladores, Web Vitals
  portal/     Cliente que se inyecta en los dispositivos conectados por Portal
  shared/     Tipos, sincronización y cálculo de contraste compartidos
  renderer/   Interfaz: pestañas, paneles, barra lateral, editor de capturas, barra de comandos
scripts/      build.mjs (esbuild) y make-icon.mjs
```

### Seguridad

Cada panel corre con `contextIsolation`, `sandbox` y sin Node. Los scripts de Fronttier viven en un *isolated world*, así que la página no puede acceder a ellos. Las opciones que relajan la seguridad (desactivar CSP, abrir CORS) están apagadas por defecto y se indican en la barra de estado mientras están activas.

## Limitaciones conocidas

- Las extensiones de Chrome y WebAuthn/llaves de acceso no están soportadas.
- INP muestra la peor interacción observada, no el percentil 98 oficial.
- La captura de página completa recorre la página con scroll y une los tramos. En páginas móviles que desbordan horizontalmente, Chromium limita el scroll y la captura llega hasta donde se puede desplazar.
- La URL pública de Portal necesita `cloudflared` instalado; sin él, Portal funciona en la red local.

## Licencia

MIT. Incluye [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0), [ws](https://github.com/websockets/ws) (MIT) y [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
