# Verificación del playtest

Comprobado el **14 de octubre de 2026** en Windows, con Node.js 24.21.0 y Chromium de Playwright. Los resultados corresponden al código local; no hay una instancia pública de Render verificada.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| TypeScript estricto | `npm run typecheck`: sin errores |
| Reglas y regresiones | 58 pruebas aprobadas |
| Red con WebSocket real | Crear, entrar, listos, iniciar, incorporación tardía, relevo por bot, reconectar, rotar token, controlar tras reconectar, transferir anfitrión, límite de salas y entrada inválida |
| Navegador | 6 flujos aprobados, 54,7 s |
| Carga | 16 clientes en dos salas completas con RTT simulado de 100, 150 y 200 ms |
| Publicador | 9 pruebas locales: selección Free, URL real, reutilización, claves ocultas, exclusión de artefactos, estados de despliegue y sala con dos clientes |
| Build de producción | `npm run build`: aprobado |
| Lockfile | `npm ci --ignore-scripts --offline --dry-run` y variante `--omit=dev`: aprobados |

Las pruebas de reglas cubren las 24 distribuciones posibles de humanos entre ambos equipos, exclusión de arqueros, selección sin duplicados, control compartido, recursos, 36 poderes, goles, reloj, prórroga y revancha. Dos simulaciones de 21.000 ciclos con la misma semilla producen el mismo estado y goles de los bots.

Las regresiones verifican que recargar permita empezar una secuencia de controles nueva, que la revancha preserve reservas y renueve las épocas, que las paredes lejanas no reflejen la pelota, que las zonas de ralentización no desarmen y que los proyectiles respeten el primer impacto y los escudos.

## Navegador y revisión visual

Los seis flujos cubren:

1. Partido online acortado, pantalla final y revancha mediante la interfaz.
2. Reasignación persistente del teclado y modificadores del mando.
3. Inicio y selección a 1024 × 768, sin desbordamiento horizontal.
4. Selección de Lucario, movimiento, pausa y regreso al inicio.
5. Dos contextos de navegador en una sala, recarga, reconexión y movimiento posterior.
6. Build estático con partida individual: cero WebSockets y controles funcionando después de desactivar la red.

Se inspeccionaron las capturas de inicio, selección y cancha en `.artifacts/`. El test de mando sustituye `navigator.getGamepads` para verificar el mapeo; falta probar un dispositivo físico.

## Medición de dos salas

La prueba usa 16 conexiones reales al servidor local. Cada cliente añade 50, 75 o 100 ms en cada dirección, conserva el orden de mensajes y envía controles a 30 Hz. Se acortan los períodos solo en el servidor de pruebas para recorrer descanso, final y revancha.

| Métrica | Lectura de la ejecución |
| --- | --- |
| Duración total | 31,88 s |
| Ciclos de simulación | 956 |
| Máximo de simulación por ciclo, ambas salas | 2,07 ms |
| Máximo de ida y vuelta medido por ping | 226 ms |
| Transferencia media JSON sin comprimir por cliente | 10,7 KiB/s |
| Marcador final y revancha | Coincidentes en todos los clientes |

La medición es local y sintética: no incluye pérdida real de red, rutas desde Perú ni CPU de Render Free. El tiempo máximo mide la simulación, no todo el trabajo de red y serialización.

## Tamaño y render

El build produjo 70,52 kB de JavaScript principal (26,69 kB gzip), 29,12 kB del worker y 20,38 kB de CSS. Los modelos se generan en código; no hay descargas externas de imágenes, fuentes o geometría.

La muestra de render en Chromium headless con **SwiftShader por software** registró 24 FPS y cinco llamadas de dibujo. No se ha validado todavía el objetivo de 60 FPS en un portátil con aceleración GPU. El selector de calidad permite reducir detalles y resolución.

## Validaciones pendientes

- Instalación y build en Linux y despliegue real de los dos servicios de Render.
- Latencia y estabilidad desde Perú con amigos, incluyendo desconexiones de red reales.
- Rendimiento con GPU física, mando físico y navegadores distintos de Chromium.
- Ajuste de equilibrio y sensación de juego mediante partidas humanas.

El lockfile incluye las dependencias opcionales de Linux y otras plataformas, obtenidas de metadatos originales presentes en la caché. La comprobación `npm ci --dry-run` valida consistencia; no prueba la descarga o ejecución de esos binarios en Linux.
