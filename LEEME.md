# ExplainOnImage

Herramienta local de escritorio, en español, para preparar capturas de tutoriales. No necesita cuentas, servicios externos ni conexión a Internet una vez preparada.

## Abrir

**Windows 10/11, x64:** haz doble clic en **Iniciar ExplainOnImage Windows.cmd**, o en **dist/ExplainOnImage-win32-x64/ExplainOnImage.exe**. Conserva toda la carpeta junto al ejecutable. También se entrega un ZIP portátil: descomprímelo y abre ExplainOnImage.exe. No requiere instalación, Node.js ni .NET.

**Este equipo (macOS arm64):** haz doble clic en **ExplainOnImage.app**, o en **Iniciar ExplainOnImage.command**. Es una compilación local sin firma de distribución ni notarización.

## Uso

1. Elige **Capturar zona**, **Abrir imagen** (PNG/JPG) o **Pegar imagen**. Si hay varios monitores, elige uno. Arrastra una zona; Esc cancela.
2. Usa **Número** para colocar 1, 2 y 3; **Flecha**, **Rectángulo** o **Texto** para explicar. Seleccionar permite mover y usar las esquinas o extremos de las figuras para cambiar su tamaño. Doble clic o **Editar texto** modifica un texto.
3. **Ocultar dato** coloca un rectángulo totalmente opaco. Cubre todo el dato y comprueba la exportación. **Desenfoque** es un efecto visual, no una garantía de privacidad.
4. Pulsa **Migue** para aplicar números/flechas naranjas, fondo azul oscuro, margen y sombra. En **Acabado** ajusta márgenes, esquinas, fondo, sombra, formato automático o 16:9 y la firma opcional.
5. **Copiar imagen** y **Guardar PNG** producen toda la composición a resolución propia de la imagen, independientemente del zoom. Tras guardar puedes abrir el PNG o mostrarlo en su carpeta.

Atajos: Ctrl+Z deshacer, Ctrl+Y rehacer, Supr eliminar, Ctrl+C copiar composición, Ctrl+V pegar imagen, Ctrl+S guardar, Ctrl+0 ajustar. En macOS también se admite Cmd. V seleccionar, N número, A flecha, R rectángulo, T texto, O ocultar y B desenfocar.

Las preferencias visuales se guardan entre sesiones. Las anotaciones y el original solo permanecen en memoria durante la edición; guarda o copia antes de cerrar. El PNG se exporta aplanado, sin capas ni metadatos de anotaciones.

## Verificación y límites

Consulta **verification/VERIFICACION.md** y **verification/desktop-results.json** para los resultados reales. Se han probado interacciones de escritorio en macOS y comparado los píxeles del PNG y portapapeles con la composición.

**La captura real se intentó y quedó bloqueada porque macOS deniega a Electron el permiso de grabación de pantalla. No se ha verificado una captura real satisfactoria.** Para capturar en macOS hay que autorizar la aplicación en Ajustes del Sistema > Privacidad y seguridad > Grabación de pantalla y reiniciarla.

La distribución de Windows se ha generado en macOS. No hay Windows ni Wine disponibles, por lo que **no se ha ejecutado ni probado el EXE en Windows**, ni se han verificado físicamente varios monitores o DPI mixto. El mapeo de coordenadas sí tiene pruebas matemáticas a 100 %, 125 %, 150 % y 200 %. Las ventanas de otros programas que ya estén en pantalla sí aparecen: forman parte del escritorio capturado.

Límites: PNG/JPG hasta 80 MB, 28 megapíxeles y 12 000 píxeles por lado. Composición hasta 80 megapíxeles. No hay guardado de proyectos editables, solo exportación PNG. El ejecutable no está firmado comercialmente; Windows puede mostrar su aviso habitual para aplicaciones sin firma.

## Código y desarrollo

Código completo en **app/src/**. Runtime: Electron 45.0.0. Dependencias y versiones fijadas en app/package-lock.json.

Desde app/: npm ci (y node node_modules/electron/install.js si se han desactivado scripts de instalación), npm start, npm test, npm run test:desktop y npm run package. Las pruebas de escritorio usan ratón, teclado, disco y portapapeles reales; los diálogos de selección de archivo devuelven rutas de prueba controladas. Requieren una sesión gráfica.

**ANALISIS_REA.md** detalla el análisis estático de ShareX, lo contrastado por fuente y las inferencias. Todas las referencias están en **references/** y no forman parte de la distribución.
