<div align="center">
  <img src="public/mdt-logo.png" alt="Mediterranean Motorsport Logo" width="128" height="128" />

  # MDT-HUD · Mediterranean Motorsport

  **Suite Profesional de Telemetría, Overlay WEC, Motor FX DirectX 11, Audio 3D, Ingeniero IA por Voz y DDU Móvil para Le Mans Ultimate**

  <p>
    <a href="https://github.com/mediterraneanmotorsport/MDT-HUD/releases/latest">
      <img alt="Última versión" src="https://img.shields.io/github/v/release/mediterraneanmotorsport/MDT-HUD?style=for-the-badge&labelColor=0a0b0e&color=1a85ff&label=Versi%C3%B3n" />
    </a>
    <a href="https://github.com/mediterraneanmotorsport/MDT-HUD/releases/latest">
      <img alt="Instalador Windows x64" src="https://img.shields.io/badge/Windows-Instalador%20x64-1a85ff?style=for-the-badge&labelColor=0a0b0e" />
    </a>
    <a href="LICENSE">
      <img alt="Licencia MIT" src="https://img.shields.io/badge/Licencia-MIT-22c55e?style=for-the-badge&labelColor=0a0b0e" />
    </a>
  </p>
</div>

---

**MDT-HUD** es la suite oficial de telemetría en tiempo real, overlay en pista, posprocesado gráfico nativo **DirectX 11**, audio espacial **WASAPI 3D**, ingeniero de pista con **IA por voz** y pantalla **DDU móvil** desarrollada para **Mediterranean Motorsport** en **Le Mans Ultimate (LMU)**. Lee directamente la memoria compartida nativa del simulador sin plugins ni inyección en el juego.

---

## Novedades Principales en v1.4.0

### Interfaz Oficial FIA WEC / F1 TV Broadcast
- **Nueva arquitectura a pantalla completa**: barra de navegación superior con indicador deslizante *spring*, fondo magnético al pasar el ratón, transiciones direccionales entre pestañas y animaciones 100 % GPU (`transform` / `opacity`) sin lag.
- **Hero Showroom en «En vivo»**: render real en alta calidad del coche que pilotas, marca de agua y emblema oficial del fabricante, silueta del circuito y clima en directo.
- **Sincronización total de temas (App + Overlay + Móvil)** y **optimización de rendimiento** (actualización inteligente en Companion para mínimo uso de CPU/GPU mientras el overlay mantiene fluidez máxima).

### Motor Gráfico Nativo DirectX 11 (`MDT-FX Engine`)
- **Shaders HLSL en tiempo real entre LMU y el HUD** (sin ReShade ni inyección): *Pyramidal Bloom, Lumen GI, Sun God-Rays, Heat Haze, FXAA 3.11, Cinematic Replay DoF, Cinema Iris Auto-Exposure, RealLongExposure, Starburst, Dirty Lens, Broadcast Sensor, Wet Reflections, Deband, Surface Blur, DPX Film, VHS/RF* y vibraciones calibradas por RPM y pianos.
- **Preset estrella `WEC / IMSA Onboard Real (Master)`**, presets de usuario guardables y **Biblioteca buscable de 369 presets `MDT-xxxx`**.
- **Generador de LUTs 3D `.cube` integrado (OKLab)** con vista previa Antes/Después y carga en 1 clic en GPU.

### Audio Espacial Nativo (`MDT-Audio3D`) y `SonidosFX`
- Captura directa del audio de `Le Mans Ultimate.exe` mediante **WASAPI Process Loopback** (48 kHz en Rust, sin Voicemeeter) con espacialización Binaural / 7.1 / 8D, reverberación de cabina en carbono y ecualizador sub-grave.
- Motor **SonidosFX** con alertas sonoras sintetizadas de telemetría.

### Spotter Inteligente e Ingeniero IA Omnisciente (`MDT-QWEN` / Piper ONNX / Ollama)
- **Personalización con tu nombre en radio**: introduce tu nombre o apodo y el spotter lo integra de forma natural en las comunicaciones (*«Bandera azul. Miguel, cuidado detrás»*).
- **Modo silencio inteligente** en curvas rápidas, frenadas fuertes y vueltas lanzadas de clasificación.
- **Predicción de Caza y Defensa vuelta a vuelta** (décimas por vuelta que recortas o pierdes y vueltas estimadas de contacto) y aviso automático de **Gomas en Ventana**.
- **6 Mensajes de Ánimo Contextuales** (racha de metrónomo, recuperación tras error, defensa exitosa, remontada en marcha, empujón en tramo final y stint largo limpio), activables/desactivables desde Ajustes.
- **Preguntas omniscientes sobre toda la parrilla por voz (Push-to-Talk)**:
  - *«¿Quién va en 5ª posición / líder / último?»*
  - *«¿Quién ha hecho el récord de pista / vuelta rápida?»*
  - *«¿Qué neumáticos lleva [piloto o P#]?»*
  - *«¿Cuánta energía virtual o combustible le queda a [piloto o P#]?»*
  - *«¿Cuántas paradas / qué coche / qué ritmo lleva [piloto o P#]?»*, *«¿Quién está en boxes?»*, *«¿Cómo va el top 5?»*.

---

## Características Completas

### 5 Temas Predefinidos de Competición (`App`, `Overlay` y `Móvil`)
- **`MDT-AURA`**: Azul eléctrico y cian (`#2287EC` + `#00E5FF`) con Dashboard WEC Broadcast, 15 LEDs y giro de volante.
- **`MDT-F1`**: Estética televisiva F1 (`#E10600`), esquinas biseladas en diagonal y luces RPM convergentes.
- **`MDT-HY`**: Le Mans Hypercar (`#FF1E38` + `#FFB800` oro híbrido ERS) sobre carbono con pantalla Cosworth DDU y *Lift & Coast*.
- **`MDT-GT3`**: Consola industrial MoTeC / Bosch GT3 Endurance (`#00E676` + `#FFD600`) con tacómetro radial.
- **`MDT-LMP2`**: Prototipo Oreca (`#00B0FF` + `#FF6D00`) con pantalla DDU, sectores y mapa multicategoría.

### DDU Móvil (`#mobile`), Pit Wall (`#pitwall`) y Streamer Deck (`#streamer`)
- **Conexión instantánea por Código QR / Wi-Fi** directo desde la pestaña **En vivo** con apertura de Firewall de Windows (puerto `1420`) en 1 clic.
- **Control por botones del volante (Gamepad API)** y *Swipe* táctil para rotar entre 15 dashboards a pantalla completa (`100dvw × 100dvh`) con *WakeLock* y pop-ups automáticos inteligentes.
- **Muro de Ingenieros (`#pitwall`)** de 4 columnas para tablet o segundo monitor y **Streamer Deck (`#streamer`)** para controlar perfiles, temas y widgets en directo.

### Widgets de Competición Incluidos
1. **Cuadro de Mandos (Dashboard)** (*5 modos*: WEC, Cosworth DDU, Radial, Compacto, Clásico)
2. **Clasificación Multicategoría (Standings)** con resaltado de compañeros de equipo MDT
3. **Relativo en Pista (Relative)** con diferencias en vivo, doblados y energía virtual
4. **Cazador de Rivales (Pace & Catch)** y **Batalla por Posición**
5. **Radar de Proximidad Cenital (Spotter)** y **Widget Team Radio**
6. **Calculadora de Estrategia y Stints WEC** (*Splash & Dash*, paradas y ahorro)
7. **Combustible y Energía Virtual (VE)** con alerta *BOX ESTA VUELTA*
8. **Asistente de Lift & Coast y Regeneración Híbrida (kW)**
9. **Neumáticos y Frenos** con semáforo térmico (`FRÍO / ÓPT / CAL`), desgaste y monitor de bloqueos (**Brake Lockup**)
10. **Contador de Límites de Pista (Track Limits)**, **Predicción de Salida de Boxes (Pit Rejoin)** y **Tráfico Multicategoría**
11. **Shift Lights LED**, **Delta periférico**, **Tiempos y Sectores**, **Pedales y Volante**, **Daños**, **Electrónica**, **Mapa del Circuito**, **Meteorología**, **Live Trace Ghost**, **MFD** y **Marca de Agua MDT Stream**.

---

## Uso Rápido

1. Inicia **Le Mans Ultimate** en modo **Ventana sin bordes (*Borderless*)** o ventana.
2. Abre **MDT-HUD**.
3. Pulsa **`Ctrl + Shift + F9`** para mover o redimensionar cualquier widget del overlay.
4. Pulsa **`Ctrl + Shift + F10`** para mostrar u ocultar el overlay en cualquier momento.
5. Pulsa **`Ctrl + K`** dentro de la app para abrir la paleta rápida de comandos.
6. Para conectar tu móvil o tablet, escanea el **Código QR** en la pestaña **En vivo** y asigna los botones de tu volante.

---

## Desarrollo y Compilación

Construido con **Tauri 2**, **Rust**, **DirectX 11 (HLSL)**, **Svelte 5**, **Tailwind CSS 4** y **SQLite**.

```bash
npm install
npm run tauri dev
```

Para generar el instalador de producción para Windows:

```bash
npm run tauri build
```

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).  
© 2026 **Mediterranean Motorsport**.
