# Verificación de ExplainOnImage

Fecha: 2026-10-23T15:38:05.815Z. Plataforma: macOS arm64.

## Resultado

10 pruebas automáticas de geometría, historial, preferencias y mapeo de captura: **10 correctas**.

Pruebas de escritorio: **22 correctas, 1 bloqueada, 0 fallos**. Se ejecutaron con Electron 45 y Playwright, sobre ventanas reales.

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

## Alcance de las comprobaciones

- Los números, flechas, rectángulos, movimientos, cambios de tamaño y texto se colocaron con eventos reales de ratón y teclado en el editor.
- Los diálogos de selección y guardado devolvieron rutas controladas, sin recorrer manualmente el explorador de archivos. La lectura y escritura de PNG/JPG fueron reales.
- PNG guardado y portapapeles del sistema: resolución 1584 × 891 y comparación píxel a píxel contra el renderizador de la vista previa.
- Se comparó la exportación antes/después de cambiar zoom y tamaño de ventana: mismos píxeles y mismas coordenadas.
- Se comprobó el rectángulo oculto en todo un bloque interior: píxeles completamente opacos, color uniforme. El PNG solo incluyó IHDR, IDAT e IEND; sin metadatos de texto o EXIF.
- El PNG se abrió en Vista Previa. Su ventana y contenido se comprobaron además mediante la herramienta de escritorio; no fue solo una petición de apertura.
- Las preferencias se leyeron del disco y se comprobó su restauración en una segunda ejecución.
- Las fuentes empaquetadas en ambos app.asar se compararon con el código final. El EXE tiene cabecera PE x64 (máquina 0x8664). Esto no equivale a ejecutar Windows.

## Captura real: intento bloqueado

Se creó una ventana de prueba independiente, con fondo conocido y datos ficticios, y se pulsó Capturar zona. El sistema informó que el permiso de grabación de pantalla para Electron está denegado. La aplicación mostró el aviso y recuperó su ventana. No se obtuvo una captura real satisfactoria y no se alcanzó el selector de zona.

Por tanto, quedan sin verificar mediante captura real: selección de área, exclusión de nuestra ventana y overlay, cancelación con Escape, resolución adquirida y mapeo físico en pantallas conectadas. No se presenta la imagen sintética como sustituto.

Las pruebas matemáticas de conversión de selección normalizada a píxeles sí pasan a 100 %, 125 %, 150 % y 200 %, incluyendo límites y selecciones inválidas. No demuestran el comportamiento del sistema de captura de Windows.

## Pendiente de un equipo Windows

Ejecución del EXE, captura real, portapapeles y diálogos de Windows, varios monitores físicos y configuraciones de DPI mixto. Este host es macOS y no dispone de Windows ni Wine.

## Archivos de evidencia

- desktop-results.json: resultados de la última batería.
- 01-inicio.png y 02-editor-completo.png: interfaz real.
- resultado-final.png: PNG compuesto y aplanado.
- ejemplo-datos-ficticios.png y ejemplo.jpg: entradas de prueba, etiquetadas como ficticias.
- 03-aplicacion-empaquetada.png: se genera al comprobar el arranque del paquete macOS.

Las pruebas se ejecutaron varias veces durante las correcciones. Este informe describe el resultado final; los fallos intermedios corregidos no se cuentan como funciones verificadas hasta pasar.
