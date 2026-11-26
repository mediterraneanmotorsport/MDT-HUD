=== MDT-HUD · VOCES DE REFERENCIA QWEN3-TTS 0.6B (CUDA / ROCm · FP16) ===

Cada subcarpeta dentro de VocesQwen3 es un perfil/voz distinto (ej: Antonio, Sara, Ingeniero_Custom).
Puedes crear todas las subcarpetas que quieras.

Dentro de cada carpeta de perfil coloca:
  1. ref.wav  (audio limpio de 5 a 15 segundos de la voz que quieres clonar; también vale .mp3 o .flac)
  2. ref.txt  (OPCIONAL pero recomendado: transcripción exacta de lo que dice ref.wav para máxima fidelidad)

Al iniciar Qwen3-TTS 0.6B desde MDT-HUD, todos los perfiles se precargan automáticamente en VRAM
(en FP16 sobre CUDA o ROCm) para responder con latencia mínima.
