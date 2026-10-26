# Verificación de ExplainOnImage 1.0.1

Entorno: macOS arm64, Electron 45.0.0. Informe actualizado tras corregir las observaciones de rendimiento y seguridad.

## Resultado

- 20 pruebas de unidad correctas: geometría, historial, límites de entrada, PNG/JPEG, limpieza de metadatos y agrupación de frames.
- 22 pruebas de escritorio correctas; 1 bloqueada por el permiso de captura; 0 fallos.
- 7 regresiones de privacidad y recursos correctas.
- npm audit: 0 vulnerabilidades conocidas después de actualizar @electron/packager a 20.3.0.

## Correcciones verificadas

| Observación | Corrección y evidencia |
|---|---|
| Desenfoque alrededor de ocultaciones | La fuente se sanea antes de filtros y remuestreo. Cambiar solo los píxeles cubiertos produce 0 canales distintos; PNG y píxeles del portapapeles son idénticos. |
| Redibujado repetido | FrameScheduler agrupa 120 peticiones en un frame. En 24 dibujos de prueba solo se asignan las 2 dimensiones iniciales del canvas. Tres desenfoques se calculan 3 veces en total, no en cada dibujo. |
| Memoria de vista y selección | Composición vertical de 79 067 664 píxeles con vista y selección de 2 887 416 píxeles cada una en este equipo. Zoom no aumenta esas superficies. |
| Copias de exportación | PNG asíncrono, IPC binario, sin decodificación/recompresión en main. La superficie de exportación se libera al terminar; activeExportPixels vuelve a 0. |
| Entradas grandes antes de decodificar | Preflight de bytes y cabeceras. Una cabecera PNG de 20 000 × 20 000 se rechaza con 0 llamadas al decodificador nativo. El tamaño del blob se comprueba antes de leerlo. |
| Dependencias de empaquetado | Se eliminó extract-zip 2.0.1. Packager 20.3.0 usa la implementación interna actual; auditoría sin avisos conocidos. |

Presupuesto de caché de desenfoques: 8 388 608 píxeles (~32 MiB RGBA) entre todos los efectos activos. En la prueba de tres regiones grandes se utilizaron 8 383 968 píxeles, sin recalcular los efectos al mover una flecha.

Estas cifras de superficies y contadores son observaciones de los tests, no mediciones de pico de RSS ni de porcentaje de CPU. Exportar a resolución nativa sigue necesitando memoria proporcional al tamaño de salida y el sistema puede convertir imágenes para el portapapeles.

## Flujo de escritorio

| Prueba | Resultado |
|---|---|
| Inicio en español y tres acciones visibles | Correcta |
| Abrir PNG mediante el diálogo de la aplicación | Correcta |
| Tres números consecutivos; deshacer reutiliza el 3 | Correcta |
| Flecha y rectángulo mediante arrastre real | Correcta |
| Seleccionar, mover, Ctrl+Z y Ctrl+Y | Correcta |
| Redimensionar rectángulo | Correcta |
| Texto editable, color y eliminar con historial | Correcta |
| Cancelar texto con Escape conserva el documento | Correcta |
| Acabado en directo: blanco, degradado, margen y sombra | Correcta |
| Desenfoque como efecto visual | Correcta |
| Ocultar dato ficticio con cobertura opaca | Correcta |
| Preset Migue, firma, fondo y formato 16:9 | Correcta |
| Zoom y tamaño de ventana conservan todos los píxeles de exportación | Correcta |
| Guardar PNG: comparación píxel a píxel con la composición | Correcta |
| Portapapeles real: resolución y píxeles idénticos al PNG | Correcta |
| PNG aplanado sin metadatos ni datos ocultos | Correcta |
| Abrir PNG fuera de la aplicación | Correcta |
| Pegar imagen desde el portapapeles del sistema | Correcta |
| Abrir JPG | Correcta |
| Captura REAL de pantalla con selección y cancelación Escape | Bloqueada por permiso del sistema |
| No hay errores de JavaScript | Correcta |
| Preferencias guardadas en disco | Correcta |
| Preferencias restauradas al reiniciar la aplicación | Correcta |

El PNG de la batería principal tiene 1584 × 891 píxeles. Archivo y portapapeles se compararon píxel a píxel con la composición. El PNG solo contiene IHDR, IDAT e IEND. Se ejercitaron ratón, teclado, importación PNG/JPG, texto, movimiento, redimensionado, historial, acabado, firma, zoom y restauración de preferencias tras reiniciar.

Los diálogos de archivo usan rutas controladas en las pruebas; lectura, escritura y portapapeles son reales. El PNG se abrió en el visor externo durante la batería.

## Límites pendientes

La captura real se intentó sobre una ventana separada con datos ficticios. macOS denegó la grabación de pantalla y no se alcanzó el selector. La muestra sintética no cuenta como captura real. Selección, cancelación y exclusión de ventana/overlay quedan pendientes de prueba real.

No hay Windows ni Wine en este entorno. Se genera el paquete Windows x64 y se comprueba su contenido, pero no se ha ejecutado allí. Varios monitores físicos y DPI mixto siguen pendientes. El mapeo matemático a 100 %, 125 %, 150 % y 200 % sí pasa.

## Evidencia

- desktop-results.json: batería completa de escritorio.
- render-regressions.json: privacidad, caché y superficies.
- npm-audit.json: auditoría del grafo instalado.
- package-smoke.json y 03-aplicacion-empaquetada.png: comprobación del paquete macOS.
- resultado-final.png: exportación normal; privacy-a.png/privacy-b.png: exportaciones idénticas ante cambios bajo máscara.
- SHA256.json: huellas del ZIP, ejecutable y PNG de ejemplo.

Uncle Lead y Uncle Senior revisaron las correcciones y no encontraron un nuevo bloqueo concreto en sus ámbitos. Su revisión fue estática y con pruebas acotadas; no sustituye pruebas de Windows ni una auditoría exhaustiva.

## Icono de la aplicación — 23/10/2026

- Ilustración original generada y exportada a PNG de 1024 × 1024, ICO con siete resoluciones e ICNS.
- Verificados los siete recursos del ICO dentro del ejecutable de Windows y la coincidencia exacta del ICNS con el recurso del paquete macOS. No se ejecutó Windows.
- Arranque del paquete macOS con Playwright: icono de cabecera cargado a 1024 × 1024, sin errores del renderizador. Captura: icon-preview.png; resultados: icon-smoke.json.
- Pruebas unitarias existentes superadas; ZIP portátil reconstruido y comprobado con testzip. Aplicación reabierta.
