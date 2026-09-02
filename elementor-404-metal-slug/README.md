# Mini-juego estilo Metal Slug para la página 404

Bloque HTML autocontenido (sin dependencias externas) pensado para el widget
**HTML** de Elementor.

## Cómo instalarlo

1. En WordPress, ve a **Elementor → Herramientas del tema (Theme Builder) → 404**
   (o edita directamente tu plantilla de página 404 con Elementor).
2. Añade un widget **HTML** en el bloque.
3. Copia todo el contenido de `metal-slug-404.html` y pégalo en ese widget.
4. Publica.

Si tu 404 ya tiene otro contenido (buscador, menú, etc.), puedes colocar este
bloque debajo o encima; el widget es independiente y no interfiere con el resto.

## Controles

- **Flechas / A-D**: moverse
- **Espacio**: saltar
- **Z o clic**: disparar
- En móvil aparecen botones táctiles automáticamente (se ocultan en escritorio).

## Notas

- Todo el juego (canvas, sprites, lógica) va en un único bloque de HTML/CSS/JS,
  sin librerías ni imágenes externas: encaja tal cual en el widget HTML de Elementor.
- El script se protege contra doble inicialización, así que puedes usarlo
  también en la vista previa del editor de Elementor sin duplicar el juego.
- Es deliberadamente simple: un jugador, disparo, enemigos que avanzan, 3 vidas
  y puntuación. Fácil de ajustar (velocidad, frecuencia de spawn, colores) editando
  el `<script>`.
