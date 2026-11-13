<div align="center">
  <img src="public/mdt-logo.png" alt="Mediterranean Motorsport Logo" width="128" height="128" />

  # MDT-HUD · Mediterranean Motorsport

  **Suite Profesional de Telemetría, Overlay WEC, Spotter de Voz y DDU Móvil para Le Mans Ultimate**

  <p>
    <a href="https://github.com/mediterraneanmotorsport/MDT-HUD/releases/latest">
      <img alt="Última versión" src="https://img.shields.io/github/v/release/mediterraneanmotorsport/MDT-HUD?style=for-the-badge&labelColor=091626&color=2287EC&label=Versi%C3%B3n" />
    </a>
    <a href="https://github.com/mediterraneanmotorsport/MDT-HUD/releases/latest">
      <img alt="Instalador Windows x64" src="https://img.shields.io/badge/Windows-Instalador%20x64-2287EC?style=for-the-badge&labelColor=091626" />
    </a>
    <a href="LICENSE">
      <img alt="Licencia MIT" src="https://img.shields.io/badge/Licencia-MIT-00e676?style=for-the-badge&labelColor=091626" />
    </a>
  </p>
</div>

---

**MDT-HUD** es la herramienta oficial de telemetría en tiempo real, overlay en pista, ingeniero de pista por voz (*Spotter*) y pantalla DDU móvil desarrollada para **Mediterranean Motorsport** en **Le Mans Ultimate (LMU)**. Lee directamente la memoria compartida nativa del simulador sin necesidad de instalar plugins externos.

---

## ✨ Características Principales

### 🎨 5 Temas Predefinidos Completos de Competición (`PC` y `Móvil`)
Cambia con un solo clic toda la estética del HUD (geometría de paneles, bordes, texturas, tipografía, modo del Dashboard y estilo de luces RPM):
- **`MDT-AURA`**: Cristal azul profundo y neón cian (`#2287EC` + `#00E5FF`) con Dashboard WEC Broadcast, 15 LEDs y giro de volante en vivo.
- **`MDT-F1`**: Inspirado en la retransmisión de Fórmula 1 (`#E10600`), esquinas biseladas en diagonal, barra superior roja y luces de RPM convergentes al centro.
- **`MDT-HY`**: Le Mans Hypercar (`#FF1E38` + `#FFB800` dorado híbrido ERS) sobre textura de fibra de carbono con pantalla Cosworth DDU y asistente *Lift & Coast*.
- **`MDT-GT3`**: Pantalla industrial MoTeC / Bosch GT3 Endurance (`#00E676` verde flúor + `#FFD600`), doble marco técnico cuadrado y tacómetro radial circular.
- **`MDT-LMP2`**: Prototipo LMP2 Oreca (`#00B0FF` azul eléctrico + `#FF6D00` naranja competición) con pantalla DDU, sectores y mapa multicategoría.

### 📱 DDU en el Móvil (`#mobile`) + 🎮 Control con Botones del Volante
- **Conexión instantánea por Código QR / Wi-Fi**: Escanea el código QR desde la pestaña **En vivo** para abrir el DDU en tu móvil (`http://<IP_LOCAL>:1420/#mobile`) a **pantalla completa automática (`100dvw × 100dvh`)** y sin apagado de pantalla (*WakeLock*).
- **Control desde el Volante (Gamepad API a 60 FPS)**: Asigna cualquier botón de tu volante USB, botonera (*button box*) o teclado (o desliza el dedo con *Swipe* en el móvil) para rotar entre pantallas individuales a pantalla completa.
- **Orden y Pantallas 100 % Personalizables**: Reordena (`↑`/`↓`), elimina (`✕`) o añade (`+`) cualquiera de los **15 dashboards individuales** (*Dashboard DDU, Relativo, Clasificación, Daños, Neumáticos, Combustible, Estrategia WEC, Lift & Coast, Cazador, Límites de Pista, Electrónica, Tiempos, Radar, Mapa, Pedales*).
- **Pop-ups Automáticos Inteligentes (Opcional)**: Si lo activas, el móvil salta automáticamente durante 5 s a *Daños* al sufrir un impacto, a *Combustible* al entrar en boxes, o muestra en gigante los cambios de *TC / ABS / Mapa Motor / Reparto de Frenada*.

### 📡 Modo "Muro de Ingenieros MDT" (`#pitwall`)
- Vista de **4 columnas simultáneas** pensada para Tablet o Segundo Monitor (`http://<IP_LOCAL>:1420/#pitwall`), reuniendo Mapa del Circuito, Clasificación, Relativo, Cazador, Dashboard DDU, Delta, Calculadora de Estrategia WEC, Combustible, Neumáticos y Daños.

### 📻 Spotter de Voz e Ingeniero de Pista (`Sara` y `Antonio`)
- Sistema de audio por carpetas (`Perfil/Sara/<Evento>/Audio1.wav, Audio2.wav...` y `Perfil/Antonio/<Evento>/...`) con **reproducción aleatoria sin repetición**, **cola de prioridades (P1 a P5)**, **histéresis anti-bucle** y **efecto de radio WEC Walkie-Talkie**.
- **17 eventos en tiempo real**: *Coche Izquierda, Coche Derecha, Tres en Paralelo, Libre, Bandera Amarilla, Bandera Azul, Bandera Verde, Full Course Yellow, Penalización, Límite Pista, Entrada Boxes, Salida Boxes, Box Esta Vuelta, Poco Combustible, Daños, Neumáticos Desgastados, Mejor Vuelta*.

### 🟢🔴 Visión Periférica en Vivo: Borde Delta y Destello de Batería 100 %
- **Borde Delta Periférico**: Todo el borde y resplandor del widget **Delta**, del **Dashboard** y del **DDU Móvil** se vuelve **Verde (`#22c55e`)** cuando mejoras tu tiempo y **Rojo (`#ef4444`)** cuando pierdes décimas, para percibirlo sin apartar la vista del circuito.
- **Alerta Estroboscópica de Batería Híbrida al 100 %**: Cuando la batería ERS alcanza el 98–100 %, los bordes del HUD destellan en **Verde Eléctrico (`#00ff66`)** con el aviso `⚡ BATERÍA 100% LLENA · DESPLEGAR ERS`.

### 🏎️ Widgets de Competición Incluidos
1. **Cuadro de Mandos (Dashboard)** (*5 modos*: WEC, Cosworth DDU, Radial, Compacto, Clásico)
2. **Clasificación Multicategoría (Standings)** con resaltado de compañeros de equipo MDT
3. **Relativo en Pista (Relative)** con diferencias en vivo, doblados y energía virtual
4. **Cazador de Rivales (Pace & Catch)** (vueltas para alcanzar al rival de delante/detrás)
5. **Radar de Proximidad Cenital (Spotter)**
6. **Calculadora de Estrategia y Stints WEC** (paradas, litros por parada, *Splash & Dash* y ahorro)
7. **Combustible y Energía Virtual** con alerta luminosa *BOX ESTA VUELTA*
8. **Asistente de Lift & Coast y Regeneración Híbrida (kW)**
9. **Neumáticos y Frenos** con **Semáforo de Ventana Térmica (`FRÍO / ÓPT / CAL`)** y **Equilibrio Delantero/Trasero (`BAL D/T`)**
10. **Contador de Límites de Pista (Track Limits)**
11. **Barra Independiente de Luces de Cambio LED (Shift Lights)**
12. **Delta de Tiempo**, **Tiempos por Vuelta y Sectores**, **Telemetría de Pedales y Volante**, **Daños del Vehículo**, **Electrónica**, **Mapa del Circuito**, **Meteorología**, **Pantalla Multifunción MFD** y **Marca de Agua MDT Stream**.

---

## 🚀 Uso Rápido

1. Inicia **Le Mans Ultimate** en modo **Ventana sin bordes (*Borderless*)** o ventana.
2. Abre **MDT-HUD**.
3. Pulsa **`Ctrl + Shift + F9`** para mover o cambiar el tamaño de cualquier widget con la rueda del ratón.
4. Pulsa **`Ctrl + Shift + F10`** para mostrar u ocultar el overlay en cualquier momento.
5. Para conectar tu móvil o tablet, ve a la pestaña **En vivo**, escanea el **Código QR** y asigna los botones de tu volante en el panel **DDU Móvil & MFD**.

---

## 🛠️ Desarrollo y Compilación

Construido con **Tauri 2**, **Rust**, **Svelte 5**, **Tailwind CSS 4** y **SQLite**.

```bash
npm install
npm run tauri dev
```

Para generar el instalador de producción firmado para Windows:

```bash
npm run tauri build
```

---

## 📄 Licencia

Distribuido bajo la licencia [MIT](LICENSE).  
© 2026 **Mediterranean Motorsport**. 
