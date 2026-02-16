# FIT Sport Editor

Editor web para dividir actividades de Garmin (archivos `.FIT`) en múltiples segmentos con distintos tipos de deporte. Ideal para corregir duatlones, triatlones u otras actividades multideporte que se grabaron como un único deporte.

## El problema

Grabaste una competición con tu Garmin pero se registró como un solo tipo de actividad (por ejemplo, "carrera"), cuando en realidad hiciste un duatlón (carrera + bici + carrera). Garmin Connect no permite cambiar el tipo de deporte por tramos después de la grabación.

## La solución

Esta app te permite:

1. **Subir** tu archivo `.FIT` original
2. **Visualizar** la gráfica de velocidad y frecuencia cardíaca a lo largo del tiempo
3. **Dividir** la actividad en segmentos haciendo clic en la gráfica o usando presets automáticos
4. **Asignar** el tipo de deporte correcto a cada segmento (carrera, ciclismo, natación, transición...)
5. **Descargar** el archivo `.FIT` modificado con múltiples sesiones

El archivo resultante se puede subir a Garmin Connect y mostrará correctamente cada parte de tu actividad multideporte.

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior

## Instalación y uso

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/garmin-fit-sport-editor.git
cd garmin-fit-sport-editor

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

La app se abrirá automáticamente en `http://localhost:5173/`.

## Generar versión para producción

```bash
# Compilar
npm run build

# Previsualizar la versión compilada
npm run preview
```

Los archivos generados estarán en la carpeta `dist/` y se pueden servir con cualquier servidor web estático.

## Stack técnico

- **Vite** — bundler y servidor de desarrollo
- **@garmin/fitsdk** — SDK oficial de Garmin para decodificar y codificar archivos FIT
- **Chart.js** — gráficas interactivas
- **HTML/CSS/JS vanilla** — sin frameworks, lo más simple posible

## Deportes soportados

| Deporte | Uso típico |
|---|---|
| Carrera | Segmentos de running |
| Ciclismo | Segmentos de bici |
| Natación | Segmentos de natación |
| Transición | Cambios entre disciplinas |
| Caminata | Segmentos andando |
| Senderismo | Rutas de montaña |

## Licencia

MIT
