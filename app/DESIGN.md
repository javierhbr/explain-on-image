# Diseño de ExplainOnImage

Aplicación local Electron con proceso principal limitado a ventanas, captura, portapapeles, preferencias y diálogos de archivos. El renderer usa HTML/CSS y Canvas 2D, sin dependencias de red.

El original se conserva en memoria y las anotaciones son objetos con coordenadas de imagen. core.mjs contiene geometría, normalización, numeración e historial. render.mjs compone fondo, sombra, imagen recortada por esquinas, desenfoques, trazos y ocultaciones opacas; incorpora una firma fuera del área de imagen. El editor muestra ese mismo bitmap y dibuja la selección sobre un lienzo aparte.

El zoom modifica solo las dimensiones CSS. Las entradas de ratón se transforman a coordenadas de imagen mediante el rectángulo visible y el desplazamiento del acabado. El formato 16:9 amplía el fondo en múltiplos exactos de 16 × 9, preservando toda la imagen a resolución nativa.

Captura: elegir monitor, ocultar ventana, esperar al compositor, obtener imagen del escritorio, mostrar selector sobre la captura congelada, convertir la selección normalizada a los píxeles realmente adquiridos y recortar. El original de escritorio se descarta al terminar o cancelar.

Seguridad: renderer aislado y sandbox, Node desactivado, CSP local, navegación y nuevas ventanas bloqueadas, puente IPC limitado y comprobación del origen y frame. Exportación por diálogo, PNG re-serializado y sin datos de proyecto. Sin telemetría, cuentas ni conexiones de runtime a servicios externos.

Historial de hasta 100 estados; nueva edición elimina el rehacer pendiente. La numeración se calcula de las anotaciones presentes y por tanto reutiliza el número deshecho. Las preferencias visuales se guardan como JSON en el perfil local del sistema.

La validación combina pruebas de geometría y estado con Electron + Playwright para las interacciones reales, píxeles del PNG y del portapapeles, y persistencia. La captura real y Windows necesitan permisos/sistemas de los que este equipo no dispone; se registran como límites de verificación.
