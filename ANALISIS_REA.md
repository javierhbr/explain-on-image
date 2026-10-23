# Investigación REA · ExplainOnImage

Fecha: 23 de octubre de 2026. Entorno: macOS arm64. Referencia: ShareX 21.0.0 portátil x64.

## Pregunta investigada

¿Cómo representa ShareX las posiciones de las anotaciones y cómo combina estas con la captura al exportar, manteniendo la coherencia con el editor?

## Adquisición y separación

No se encontró ShareX en /Applications, ~/Applications ni entre los archivos de primer nivel cuyo nombre contiene ShareX en ~/Downloads. Esto no demuestra que no exista en otra ubicación. Este equipo no ejecuta Windows y no dispone de Wine.

Se descargó exclusivamente desde la publicación oficial:
https://github.com/ShareX/ShareX/releases/tag/v21.0.0

Archivo: references/ShareX-21.0.0-portable-x64.zip. Extracción: references/sharex-portable/. No se instaló ni ejecutó ShareX. Las referencias y el código fuente consultado permanecen separados de app/, que contiene nuestra implementación original.

## Análisis realizado mediante REA

Se utilizaron las herramientas MCP:
- inspect_managed_artifact: inspección estática PE/CLI de ShareX.ImageEditor.dll, en vista resumen.
- inspect_managed_members: primera selección de nombres en ShareX.ImageEditor.dll; no coincidió ninguno de los tres tipos propuestos. Esa consulta no prueba nada sobre sus posiciones o exportación.
- inspect_managed_members: selección exacta de ShareX.ScreenCaptureLib.BaseShape y ShareX.ScreenCaptureLib.ShapeManager en ShareX.ScreenCaptureLib.dll. Ambos tipos sí se encontraron.

La segunda selección útil produjo la evidencia:
ev_41be883e5d8b7d2092c79058cf2c8a9f8dde21c0c678b6a1641bf08aa2911a7d

Artefacto: ShareX.ScreenCaptureLib.dll, 872 960 bytes.
SHA-256: 196d921eb2e32181b49124d834deab7614f5b822284cdd2508b043d85c167922

El extracto original de campos, métodos, llamadas y cobertura se conserva en references/REA-evidencia-seleccion.json. Los tokens se refieren exclusivamente a este binario y MVID.

### Hechos observados en el binario

BaseShape declara los campos rectangle, startPosition y endPosition, además de accesores Rectangle, StartPosition y EndPosition. Las llamadas del setter de Rectangle incluyen System.Drawing.RectangleF.get_Location/get_X/get_Width/get_Y/get_Height y un constructor System.Drawing.PointF. Hay métodos Move y MoveAbsolute.

ShapeManager declara Shapes, CurrentDPI, IsRenderingOutput y RenderOffset. En RenderOutputImage (sobrecargas 0x06000581 y 0x06000582), REA recuperó llamadas a:
- Image.Clone y Bitmap.SetResolution.
- get_DrawingShapes y get_EffectShapes.
- set_IsRenderingOutput, set_RenderOffset y MoveAll.
- Graphics.FromImage.
- BaseEffectShape.OnDrawFinal y BaseDrawingShape.OnDraw.
- De nuevo MoveAll, set_RenderOffset y set_IsRenderingOutput.

Esto verifica la existencia de un modelo geométrico y de un recorrido de composición sobre imagen clonada. No es una observación visual de ShareX ni una prueba de equivalencia de su editor y su PNG.

### Cobertura y límites de REA

La herramienta informó coverage.state = complete e issues = [] para la selección solicitada. Esa cobertura se limita a lo que produce el analizador estático para esos dos tipos: no equivale a una auditoría completa de ShareX, ni resuelve todas las llamadas fuera de la selección.

No se utilizó un descompilador C# adicional, no se instalaron grandes herramientas, no se ejecutó ShareX y no se observaron capturas ni exportaciones suyas. Los campos y las aristas de llamada no prueban por sí solos el orden exacto de ejecución, los valores de los desplazamientos, la corrección con DPI mixto, ni la coincidencia visual de todas sus herramientas.

## Consulta directa del código fuente: separada de REA

Se consultaron y guardaron dos archivos del repositorio oficial en la etiqueta v21.0.0:

- https://github.com/ShareX/ShareX/blob/v21.0.0/ShareX.ScreenCaptureLib/Shapes/BaseShape.cs
- https://github.com/ShareX/ShareX/blob/v21.0.0/ShareX.ScreenCaptureLib/Shapes/ShapeManager.cs

Copias de consulta: references/source/. Se intentó obtener también ShapeManagerImageEditor.cs, pero esa ruta no existía; no se utilizó para conclusiones.

Esta lectura directa, NO REA, permite precisar que RenderOutputImage clona el bitmap, activa el indicador de salida, establece el desplazamiento, mueve temporalmente las figuras por el desplazamiento inverso, dibuja efectos y figuras, y restaura el desplazamiento y los indicadores. En la copia consultada, estas operaciones aparecen alrededor de las líneas 1393–1425 de ShapeManager.cs.

El uso compartido de los objetos de dibujo favorece la consistencia. Que todos los resultados del editor sean siempre idénticos al exportar sigue siendo una inferencia sin verificación de ejecución de ShareX.

## Decisiones de nuestra implementación

Los hallazgos apoyan separar los datos geométricos de la imagen y generar una composición raster al exportar. Nuestra aplicación implementa esta idea con código propio:

- Coordenadas en píxeles de la imagen original, independientes del zoom.
- CompositionRenderer con una rutina compartida para vista previa, PNG y portapapeles.
- Selección y controles del editor en un lienzo de interacción independiente.
- Desplazamientos del acabado aplicados mediante una transformación de dibujo; no se mueven temporalmente los objetos.
- Fuente saneada con rectángulos opacos antes de cualquier desenfoque o remuestreo, pasada opaca final y resultado aplanado en PNG.
- Ningún metadato de anotaciones ni imagen original oculta en el archivo exportado.

La identidad entre nuestra vista previa y los archivos exportados está respaldada por nuestras pruebas de píxeles, no por REA ni por ShareX.

No se copiaron código de implementación, recursos gráficos ni archivos de ShareX a la aplicación.
