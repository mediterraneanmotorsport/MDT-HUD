=== PERFILES DE VOZ DE REFERENCIA PARA QWEN3-TTS (EMBEBIDOS EN EL .EXE) ===

Cómo añadir o actualizar voces clonadas para Qwen3-TTS:
1. Crea una subcarpeta por cada perfil de voz (por ejemplo: Sara, Antonio, IngenieroPro).
2. Coloca dentro un archivo de audio limpio de 5 a 15 segundos en formato WAV (ej. ref.wav).
3. (Opcional pero muy recomendado para Qwen3-TTS Base) Crea un archivo ref.txt con la transcripción exacta en español de lo que se dice en ref.wav.
4. Al compilar la app (`cargo build` / `tauri build` / GitHub Actions), `build.rs` incrusta automáticamente los bytes del .wav dentro del ejecutable `.exe`.

SEGURIDAD:
- Una vez instalado el `.exe` en el PC de cualquier usuario, esta carpeta NO se copia al disco ni es accesible por el usuario.
- Los audios se envían al motor Qwen directamente desde la memoria RAM.
