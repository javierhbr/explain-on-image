# Diseño de ExplainOnImage 1.0.1

Aplicación local Electron con un proceso principal limitado a ventanas, captura, portapapeles, preferencias y diálogos. El renderer usa Canvas 2D, sin servicios de red.

## Imagen y seguridad de entrada

image-policy.mjs inspecciona dimensiones PNG/JPEG sin decodificar píxeles. El proceso principal limita archivos y blobs a 80 MB y examina como máximo 1 MB de cabecera antes de leer el archivo completo. Rechaza entradas mayores de 28 MP o 12 000 px por lado. El renderer repite la validación antes de createImageBitmap, verifica las dimensiones resultantes y cierra el bitmap anterior al reemplazarlo. Las importaciones de la interfaz se serializan.

## Modelo y renderizado

Las anotaciones usan coordenadas de la imagen original. core.mjs contiene geometría, numeración e historial de hasta 100 estados, sin bitmaps en el historial.

CompositionRenderer comparte la misma rutina de dibujo para la vista y la exportación. Antes de cualquier desenfoque o remuestreo, crea una fuente saneada con todas las ocultaciones opacas. Una pasada opaca final cubre también los trazos. Los cambios de ocultación invalidan los efectos almacenados.

Los desenfoques se calculan sobre recortes con margen de muestreo. La caché completa tiene un presupuesto de 8 Mi píxeles (~32 MiB RGBA), repartido entre los desenfoques activos para evitar expulsiones continuas de efectos grandes.

FrameScheduler agrupa las peticiones en requestAnimationFrame. La vista previa y la selección solo tienen resolución de ventana, con un presupuesto de aproximadamente 4 Mi píxeles cada una; sus dimensiones solo cambian si cambia la ventana. Un elemento de tamaño lógico conserva el desplazamiento y las barras de scroll. Zoom y ratón se transforman entre coordenadas de imagen, composición y ventana.

## Exportación

Solo al exportar se crea una superficie de resolución nativa, hasta 80 MP. toBlob genera el PNG de forma asíncrona y finally libera la superficie. Los bytes viajan por IPC como Uint8Array, sin base64 ni decodificación/recompresión de píxeles en el proceso principal.

El proceso principal comprueba dimensiones y estructura, conserva únicamente IHDR/IDAT/IEND y descarta metadatos y bytes finales. El portapapeles recibe esos mismos bytes. Guardar utiliza un temporal aleatorio con creación exclusiva, permisos restrictivos y renombrado.

La exportación nativa sigue necesitando memoria proporcional a su resolución; el sistema operativo también puede convertir el PNG al formato nativo del portapapeles.

## Captura y aislamiento

Se elige monitor, se oculta la aplicación, se adquiere la pantalla, se muestra el selector sobre la imagen congelada y se convierte la selección normalizada a los píxeles adquiridos. Los buffers de captura se liberan al terminar o cancelar.

Renderer aislado y sandbox, Node desactivado, CSP local, navegación y nuevas ventanas bloqueadas, puente IPC limitado con comprobación del origen y frame. Sin cuentas, telemetría ni servicios externos.

## Validación

Pruebas de geometría, historial, parser sin decodificación y agrupación de frames; Electron + Playwright para edición y salida real; regresiones de privacidad con desenfoques, límite de caché, composición vertical de 79 MP y liberación de exportación. El informe verification/VERIFICATION.md distingue resultados observados de estimaciones.

La captura real continúa bloqueada por el permiso de grabación de pantalla del host. Windows, varios monitores físicos y DPI mixto siguen pendientes de verificación en un equipo adecuado.

Desarrollo: Node >=22.12, Electron 45.0.0, @electron/packager 20.3.0 y lockfile fijado.
