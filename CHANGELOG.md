# Changelog

## [1.0.6](https://github.com/mediterraneanmotorsport/MDT-HUD/compare/v1.0.4...v1.0.6) (2026-11-16)

### Features & Improvements

* **Integración Oficial con Discord (`Ingeniera MDT`)**: Webhook oficial integrado por defecto para todos los miembros y pilotos de MDT (`https://discord.com/api/webhooks/...`). Envío automático al finalizar cada sesión o stint del informe gráfico PNG con el nombre del piloto, tiempos por sector, vuelta rápida, vueltas completadas y telemetría de neumáticos.
* **Modo Broadcast (Espectador) con Selección de Piloto en Tiempo Real**: Perfil de overlays especializado para comentaristas y streamers (`MDT Modo Broadcast`). Al hacer clic sobre cualquier piloto en la tabla de clasificación (Standings o Pitwall), el juego enfoca automáticamente la cámara en dicho coche mediante la API REST de LMU (`/rest/watch/focus/{slotid}`) y todos los complementos (velocidad, marchas, pedales, RPM, neumáticos y consumos) muestran los datos en vivo del piloto seleccionado.
* **DDU Móvil Server-Sent Events (SSE) a 30 FPS**: Arquitectura de transmisión reactiva continua sin saturación de conexiones HTTP ni congelaciones de datos en velocidad o marchas. Incluye soporte de Screen Wake Lock para mantener la pantalla del móvil siempre encendida sin apagarse por inactividad, auto-ocultación de la barra de configuración tras 5 segundos y logotipo oficial de MDT al escanear.
* **Aviso de Limitador de Boxes Preciso**: Detección basada en el bit real del limitador del simulador (`speed_limiter_active`), eliminando cualquier falso destello durante cambios de marcha e indicando el limitador al instante incluso a coche parado.
* **Muro de Ingenieros (Pitwall) con Mapa Interactivo**: Integración del mapa completo del circuito en vivo con telemetría de rivales, estrategia de combustible, lift & coast, meteorología con previsión de cambios y personalización de datos a mostrar.
* **Gestor de Perfiles de Voz del Spotter**: Botón directo para acceder a la carpeta de perfiles de voz `.wav` en Windows con escaneo dinámico de nuevos perfiles de audio personalizados.
* **Auto-escalado de Perfiles entre Resoluciones (Auto-size)**: Ajuste proporcional de posición y tamaño de todos los widgets al importar configuraciones de otras pantallas (p. ej. Ultrawide a 1080p).

### Features & Bug Fixes

* **Opción de Mapa del Circuito sin Recuadro (`showFrame`)**: añadido el interruptor «Mostrar recuadro de fondo» en las opciones del complemento **Mapa del circuito** (y en el menú ⚙️ Configurar del DDU Móvil) para poder mostrar únicamente la silueta del circuito y los coches flotando con contorno de alto contraste sin caja de fondo
* **Corrección de Complementos del Overlay al Desactivar y Volver a Activar**: solucionado el bloqueo por filtro `lastSaved` y la doble escritura asíncrona en `saveConfig()`, garantizando que cualquier complemento reaparezca al instante al reactivarlo, e incorporado auto-ajuste dentro de los bordes del monitor (`WidgetFrame`) para que ningún complemento quede fuera de pantalla en monitores 1080p o con escalado DPI
* **Conexión Wi-Fi del Dashboard Móvil para Todos los Usuarios + Firewall en 1 Clic**: eliminada la IP por defecto estática, añadida detección multi-interfaz (`ipconfig` + rutas LAN priorizando `192.168.x.x` frente a VPNs/adaptadores virtuales), selector de IPs en vivo y apertura automática / botón de 1 clic para autorizar el puerto TCP `1420` en el **Firewall de Windows Defender**

## [1.0.3](https://github.com/mediterraneanmotorsport/MDT-HUD/compare/v1.0.2...v1.0.3) (2026-11-14)

### Features & Bug Fixes

* **Sincronización Reactiva Instantánea en el DDU Móvil (`#mobile`) sin cambiar de página**: corregido el conflicto por el que `loadConfig()` en navegadores móviles llamaba al mock vacío tras la primera carga y mejorada la reactividad en sitio (`applyMergedInPlace` + `config.revision`) junto con el estado compartido `AppState.mobile` en Rust (`< 30 ms`), el endpoint `/__mobile_track_map` y la cabecera `Access-Control-Allow-Private-Network: true`
* **5 Temas Visuales Radicalmente Distintos en App + Overlays + Móvil (con Fuentes Propias)**: `MDT-AURA` (Barlow / cristal aeroespacial neón), `MDT-F1` (Impact / Arial Black Italic con cortes diagonales y franja roja `#e10600`), `MDT-HY` (Bahnschrift / Consolas con textura de fibra de carbono tejida y borde rojo/dorado WEC), `MDT-GT3` (Cascadia Mono 100% digital con cuadrícula de osciloscopio y doble filete verde/amarillo) y `MDT-LMP2` (Franklin Gothic / Georgia con doble franja Gulf naranja y azul cielo), además de selector rápido en la barra superior de la aplicación
* **Nueva Marca de Agua MDT (Stream) con Piloto en Vivo, Bandera SVG del País y Foto Circular**: muestra automáticamente el nombre del piloto que está conduciendo en Le Mans Ultimate, detecta o permite elegir la bandera de su país en SVG nítido y permite subir una foto del piloto recortada dentro de un círculo con anillo luminoso

## [1.0.2](https://github.com/mediterraneanmotorsport/MDT-HUD/compare/v1.0.1...v1.0.2) (2026-11-14)

### Bug Fixes & Improvements

* **Sincronización 1:1 en Tiempo Real entre el Dashboard de PC y el DDU Móvil**: el servidor nativo comparte automáticamente `config.json` (`appConfig`) con el teléfono para que ambos usen exactamente el mismo diseño, opciones, unidades, tema y textos en español (`MARCHA`, `VELOCIDAD`, `LIMITADOR DE PIT ACTIVO`, `TC ACTIVO`, `ABS ACTIVO`, `HÍBRIDO`, `EMPUJE / REGEN / ESPERA`)
* **Lectura de Memoria Compartida a 66 Hz sin Bloqueos (`LMU_Data`)**: eliminado el bloqueo de 250 ms de `LMU_Data_HoldEvent` en LMU y desactivado el bucle de prueba `mock.ts` en clientes móviles (`#mobile`, `#pitwall`), corrigiendo por completo las **marchas** y el panel en vivo de **TC (`SLIP / CUT`), ABS, MAP, BB, Migración (`MIG`) y Barras (`ARB`)** con resaltado luminoso instantáneo al cambiar cada parámetro

## [1.0.1](https://github.com/mediterraneanmotorsport/MDT-HUD/compare/v1.0.0...v1.0.1) (2026-11-13)

### Features

* **Servidor HTTP Nativo en Rust para DDU Móvil (`#mobile`) y Muro de Ingenieros (`#pitwall`)**: ahora el ejecutable de escritorio `MDT-HUD.exe` incluye su propio servidor integrado en el puerto `1420` sin depender de servidores externos, sirviendo la telemetría a 30 Hz y datos demo en toda la red Wi-Fi (`http://<IP_LOCAL>:1420`)
* **5 Temas Completos de Overlay (`MDT-AURA`, `MDT-F1`, `MDT-HY`, `MDT-GT3`, `MDT-LMP2`)** seleccionables en vivo tanto en el PC como en el móvil
* **DDU Móvil Individual a Pantalla Completa con Auto-Escalado**: 1 único dashboard por pestaña adaptado automáticamente al 100% de la pantalla del teléfono, con soporte para **Swipe táctil**, botones del volante (60 FPS), **Código QR Wi-Fi** y editor para **ordenar (`↑`/`↓`), eliminar (`✕`) o añadir (`+`) pantallas**
* **Borde Periférico Delta (Verde/Rojo) y Destello Estroboscópico de Batería al 100%**: el borde del Delta y del HUD se ilumina en verde al mejorar tiempo y en rojo al perder, y parpadea con destello verde neón cuando la batería híbrida ERS alcanza el 100%
* **Calculadora de Estrategia y Stints WEC (`StintPlanner`)**, **Semáforo Térmico de Neumáticos (`FRÍO / ÓPT / CAL`) + Balance de Desgaste (`BAL D/T`)**, **Pop-ups Automáticos Inteligentes Opcionales** y **Muro de Ingenieros de 4 columnas (`#pitwall`)**

## [1.0.0](https://github.com/mediterraneanmotorsport/MDT-HUD/releases/tag/v1.0.0) (2026-11-13)

### Features

* lanzamiento oficial de **MDT-HUD v1.0.0** para **Mediterranean Motorsport** con identidad visual `#2287EC`, iconos y logos del toro MDT e interfaz 100% en español
* **Cuadro de mandos (Dashboard)** con 5 modos seleccionables (`WEC Broadcast MDT`, `Cosworth/MoTeC DDU`, `Tacómetro Circular + Volante`, `Compacto Horizontal` y `Clásico`), 3 estilos de luces de RPM, volante animado y barras de pedales integradas
* **Spotter de Voz e Ingeniero de Pista** con 102 audios `.wav` (`Perfil/Sara` y `Perfil/Antonio`), selección aleatoria sin repetición, cola de prioridades P1–P5 anti-bucle y filtro Walkie-Talkie WEC
* nuevos widgets: **Radar de Proximidad**, **Cazador de Rivales (Pace & Catch)**, **Barra de Luces de Cambio LED**, **Contador de Límites de Pista (Track Limits)**, **Asistente de Lift & Coast y Regeneración** y **Marca de Agua MDT (Stream)**
* resaltado automático de **compañeros de equipo MDT** en Clasificación, Relativo y Mapa del Circuito
* exportación de **Informe Gráfico PNG de Sesión con logos de MDT** para Discord y compartición de perfiles `.mdthud.json` con 3 plantillas de equipo

## [0.11.0](https://github.com/szpolny/mulsanne/compare/v0.10.0...v0.11.0) (2026-11-09)


### Features

* improve tyre, fuel saver and relative estimates ([#29](https://github.com/szpolny/mulsanne/issues/29)) ([ea40968](https://github.com/szpolny/mulsanne/commit/ea4096830ae5d22b89f6b01c2e75eb79ea55ca3f)), closes [#28](https://github.com/szpolny/mulsanne/issues/28)

## [0.10.0](https://github.com/szpolny/mulsanne/compare/v0.9.0...v0.10.0) (2026-11-08)


### Features

* ask users to star the project on GitHub ([#23](https://github.com/szpolny/mulsanne/issues/23)) ([88d8345](https://github.com/szpolny/mulsanne/commit/88d83451ed1536e8212e4230164597f637b0a428))
* show the game's car renders for the driven livery ([#25](https://github.com/szpolny/mulsanne/issues/25)) ([6d71e8d](https://github.com/szpolny/mulsanne/commit/6d71e8ddd2b195edb9a4a5df26932d428168e6c5))

## [0.9.0](https://github.com/szpolny/mulsanne/compare/v0.8.1...v0.9.0) (2026-11-07)


### Features

* add experimental Linux support ([#21](https://github.com/szpolny/mulsanne/issues/21)) ([3a294d5](https://github.com/szpolny/mulsanne/commit/3a294d5bcbcaef107e8c7e793cf80b45c8daca3e))

## [0.8.1](https://github.com/szpolny/mulsanne/compare/v0.8.0...v0.8.1) (2026-11-07)


### Bug Fixes

* cache the daily race schedule and fetch it about once a day ([#19](https://github.com/szpolny/mulsanne/issues/19)) ([703ddd5](https://github.com/szpolny/mulsanne/commit/703ddd51476af8b2ecaa8e6cd79aa74f99ce6d8d))

## [0.8.0](https://github.com/szpolny/mulsanne/compare/v0.7.1...v0.8.0) (2026-11-07)


### Features

* show tyre wear per lap, core temperatures and a fuel saver ([#17](https://github.com/szpolny/mulsanne/issues/17)) ([2883126](https://github.com/szpolny/mulsanne/commit/28831263e4c7604f02d1426cd3cf95cbd3b95a6c))

## [0.7.1](https://github.com/szpolny/mulsanne/compare/v0.7.0...v0.7.1) (2026-10-31)


### Bug Fixes

* clean up changelog references and show notes for skipped versions ([#14](https://github.com/szpolny/mulsanne/issues/14)) ([0cca665](https://github.com/szpolny/mulsanne/commit/0cca665a300e0e9e78285900df16dd20330b5431))

## [0.7.0](https://github.com/szpolny/mulsanne/compare/v0.6.1...v0.7.0) (2026-10-31)


### Features

* add per-widget size and opacity ([#11](https://github.com/szpolny/mulsanne/issues/11)) ([1f1ab4e](https://github.com/szpolny/mulsanne/commit/1f1ab4e92f33a16a6123fb8951d5f93646819e92)), closes [#9](https://github.com/szpolny/mulsanne/issues/9)
* choose which monitor the overlay appears on ([#13](https://github.com/szpolny/mulsanne/issues/13)) ([3530790](https://github.com/szpolny/mulsanne/commit/3530790f95897fc4176bc783510c740851e0ab3f)), closes [#8](https://github.com/szpolny/mulsanne/issues/8)

## [0.6.1](https://github.com/szpolny/mulsanne/compare/v0.6.0...v0.6.1) (2026-10-25)


### Bug Fixes

* improve trace chart zoom and pan controls ([64ddf25](https://github.com/szpolny/mulsanne/commit/64ddf25b27e1267aff11d30efbd15e51863ae6eb))

## [0.6.0](https://github.com/szpolny/mulsanne/compare/v0.5.0...v0.6.0) (2026-10-25)


### Features

* add synchronized trace chart zoom controls ([96841f1](https://github.com/szpolny/mulsanne/commit/96841f1b5eab8a23b1725830e787ba638742d5fb))
* display unserved penalty details ([e7f04e7](https://github.com/szpolny/mulsanne/commit/e7f04e7aee32af817f5af4dba170400951e61fa6))


### Bug Fixes

* migrate app data to the new identifier ([b39b942](https://github.com/szpolny/mulsanne/commit/b39b942de2047908e5d7179d1f4d5bcdc362c26f))

## [0.5.0](https://github.com/szpolny/mulsanne/compare/v0.4.0...v0.5.0) (2026-10-23)


### Features

* add optional online lap rankings with manual or automatic uploads ([6f40b7c](https://github.com/szpolny/mulsanne/commit/6f40b7cd2d3649358845d0dc241e849c42cd7246))
* compare your laps with ranked laps' telemetry ([6f40b7c](https://github.com/szpolny/mulsanne/commit/6f40b7cd2d3649358845d0dc241e849c42cd7246))
* record the game version with each session ([6f40b7c](https://github.com/szpolny/mulsanne/commit/6f40b7cd2d3649358845d0dc241e849c42cd7246))
* suggest racing display names and allow anonymous uploads ([6f40b7c](https://github.com/szpolny/mulsanne/commit/6f40b7cd2d3649358845d0dc241e849c42cd7246))

## [0.4.0](https://github.com/szpolny/mulsanne/compare/v0.3.0...v0.4.0) (2026-10-16)


### Features

* add issue reporting guidance ([bade695](https://github.com/szpolny/mulsanne/commit/bade695edb271cc895f6c929c261f14066b48c81))
* show optional lap times in relative widget ([ddc6dd9](https://github.com/szpolny/mulsanne/commit/ddc6dd95ee340a2daed933d6e6c1f6f9780d864d))
* show release notes after app updates ([4f150d9](https://github.com/szpolny/mulsanne/commit/4f150d91dbfcb4a59240efa31c729b361cbc6ec0))
* show repair damage in telemetry widget ([6c0aa59](https://github.com/szpolny/mulsanne/commit/6c0aa5964fbe48ab4510bd26d10578105530a20c))


### Bug Fixes

* preserve fractional track limit points ([31ce72a](https://github.com/szpolny/mulsanne/commit/31ce72a45aa14a0ef36aab93df88cafcc17fc97b))

## [0.3.0](https://github.com/szpolny/mulsanne/compare/v0.2.0...v0.3.0) (2026-10-14)


### Features

* add an option to hide the clutch bar ([e79a272](https://github.com/szpolny/mulsanne/commit/e79a272b808e80218eedbe4cffeb292819552db2))
* add overlay layout profiles ([4868f7c](https://github.com/szpolny/mulsanne/commit/4868f7c5d3af4dd68ee27c85fdcbbb8305edb373))
* add session progress and class position stats ([fe019e8](https://github.com/szpolny/mulsanne/commit/fe019e8c3a79926a1aa537bf77a78511c50fbbc5))
* add virtual energy and improve input widgets ([6ea40c7](https://github.com/szpolny/mulsanne/commit/6ea40c7fbf8cad5269083c79ab46b0cdee790f07))
* customize class standings and lap time highlights ([1ca8dcd](https://github.com/szpolny/mulsanne/commit/1ca8dcd6a5eff02367cd36fe725cdd20a3567040))
* show finish status and chequered flags ([f8b381e](https://github.com/szpolny/mulsanne/commit/f8b381e0ebf0b7d495c2bc6a193531f52519403a))
* show upcoming daily race schedule ([39b7ce1](https://github.com/szpolny/mulsanne/commit/39b7ce152871690c282b8d653a36a29a44af96dd))
* show vehicle status and force feedback on dashboard ([d9ce1a0](https://github.com/szpolny/mulsanne/commit/d9ce1a057e46ee40d012f917a16376cd94014bc5))


### Bug Fixes

* show local yellow only in the player's sector ([c5291bf](https://github.com/szpolny/mulsanne/commit/c5291bff3dd04444cc8e75effa64f8190e4f4798))

## [0.2.0](https://github.com/szpolny/mulsanne/compare/v0.1.0...v0.2.0) (2026-10-13)


### Features

* add installers and auto-updates ([bc9bb7f](https://github.com/szpolny/mulsanne/commit/bc9bb7f306127ab156e2b5fad902fb0f9539ed8c))
