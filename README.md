# PO-33 Toolkit

[![Android APK](https://github.com/arfipod/po-33_toolkit/actions/workflows/android.yml/badge.svg)](https://github.com/arfipod/po-33_toolkit/actions/workflows/android.yml)

Estudio Android offline basado en el Sample Board original: importa, graba, afina, crea bancos de sonidos y compone clips para muestrear en el PO-33.

**[Descargar APK](https://github.com/arfipod/po-33_toolkit/releases/download/latest/PO33-Toolkit.apk)** · [Compilaciones y pruebas](https://github.com/arfipod/po-33_toolkit/actions)

## Android

- Paquete `com.arfipod.po33toolkit`; Android 8+ (API 26), target/compile API 36.
- APK universal sin bibliotecas nativas por arquitectura; compatible con ARM64, incluido Honor Magic5 Pro con Android 16 / MagicOS 10.
- Interfaz adaptativa en WebView empaquetada localmente, con integración Java para micrófono, selector de archivos, guardado y zonas seguras de pantalla/teclado. No requiere conexión ni cuenta.
- Permiso de micrófono solicitado sólo al grabar; máximo 40 s. Importar audio no necesita ese permiso.
- Firma de desarrollo estable compartida por APK local y CI; véase [signing/README.md](signing/README.md). Exporta tus proyectos antes de desinstalar.

## Qué incluye

**Samples.** 16 pads, ZIP con nombres `01_nombre.wav`…`16_nombre.wav`, archivos de audio decodificables por WebView (WAV recomendado), micrófono, forma de onda, nombre, recorte, normalización, invertir, deshacer una edición y exportar WAV. Packs Game Boy y Warm Synth suministrados por el propietario incluidos. Warm Synth se divide en 16 partes iguales; sus acordes se conservan sin asumir nombres que el WAV no contiene.

**Afinación.** Detección de nota y cents, nota original manual, corrección offline cromática/mayor/menor con intensidad, original recuperable y envío al pad. Generador de 1–16 notas o acordes, silencios y dos modos de transposición: sampler (velocidad/duración variable) y duración fija (síntesis sincronizada al período). La afinación trabaja con una voz/nota monofónica; no es separación de fuentes, afinación polifónica ni Auto-Tune comercial. Puede producir artefactos; no garantiza conservación de formantes. Para ruido, percusión y acordes ya grabados usa Sampler.

Ejemplos: `C4 D4 E4 F4 G4 A4 B4 C5 - - - - - - - -` o `C4:maj A3:min F3:maj G3:7`. Se aceptan `Do4`, `Fa#3` y `Bb3`. Acordes: `maj`, `min`/`m`, `maj7`, `m7`, `7`, `sus2`, `sus4`, `dim`. Los huecos restantes se rellenan con silencio.

**Clips.** Cuatro clips A–D, cuatro pistas, 1/2/4 compases de 16 pasos, 40–240 BPM, swing, tres intensidades por paso, selección de pad, transposición/volumen por pista, bucle, copia, encadenado, envío al pad y WAV. Los cambios detienen el bucle; vuelve a reproducir para escuchar la edición. Las colas se cortan al final del clip para que su duración sea exacta.

**PO-33.** WAV mono PCM 16-bit/44,1 kHz con 16 posiciones de duración uniforme y 30 ms de silencio al final de cada una, mapa de tiempos y cuenta atrás para reproducción. Duración máxima: 40 s. Un corte más corto que la muestra la recorta; la interfaz lo avisa. La sesión contiene hasta 40 s entre los 16 pads.

**Proyectos.** Autoguardado IndexedDB y exportación/importación `.po33.json` con muestras, fuente de afinación, clips y ajustes. No confundir estos proyectos con el backup digital del hardware.

## Transferencia al hardware

Conecta una salida de audio USB-C/DAC del móvil al **line in** del PO-33 mediante cable de 3,5 mm. Mantén `record + 9–16` para grabar un banco con cortes o `record + 1–8` para una muestra melódica. Reproduce el WAV. Comprueba el nivel y la memoria libre del PO-33. Ajusta cada corte con TRIM si hace falta, especialmente los silencios.

El límite de **40 segundos es compartido por todos los sonidos del PO-33**, no por banco. El contador de la app no conoce la memoria que ya ocupa el hardware. Los clips se transfieren como audio; esta app no genera el protocolo propietario de backups ni programa los patrones internos. No uses «receive data» con los WAV generados.

[Manual oficial del PO-33](https://teenage.engineering/guides/po-33/en).

## Compilar y probar

JDK 17, Android SDK con `platforms;android-36`, `build-tools;36.0.0` y Node 22.

```sh
export ANDROID_HOME=/ruta/android-sdk
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:ui
./gradlew assembleDebug lintDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. Gradle Wrapper 8.13 y AGP 8.11.1 están fijados. Las dependencias JS son sólo de pruebas: la app no carga CDNs ni paquetes remotos.

`npm test` comprueba frecuencias reales de afinación/transposición, silencios, duración de bancos, cabecera PCM y tiempos/swing del secuenciador. `npm run test:ui` prueba carga de packs, detección, generación, exportación de WAV y mapa, clips, round-trip de proyectos, autoguardado y ausencia de desbordamientos a 360/412 px. Android Lint comprueba permisos y compatibilidad de APIs. Los tests de navegador no sustituyen una prueba física de latencia o grabación en el Honor.

## CI/CD

`.github/workflows/android.yml` se ejecuta en pushes a `main`, PRs, tags `v*` y manualmente. Primero ejecuta las pruebas DSP/UI; después compila y pasa Android Lint; conserva APK, checksum e informes como artefactos. En cada push a main publica el APK en la prerelease `latest`. Un tag `v*` publica una release versionada. Utiliza `GITHUB_TOKEN` con escritura de contenidos únicamente en el job de publicación, sin PAT ni secretos externos.

La publicación es de APKs con firma de desarrollo. Para una distribución de producción debe configurarse una clave privada separada y planear la migración de firma/paquete.

## Estructura

- `app/src/main/assets/`: interfaz, DSP puro, worker y packs.
- `app/src/main/java/`: contenedor Android y puente de micrófono/archivos.
- `tests/`: pruebas DSP y flujos de interfaz.
- `signing/`: clave pública de desarrollo intencional, no identidad de producción.

Proyecto independiente, sin afiliación con Teenage Engineering.
