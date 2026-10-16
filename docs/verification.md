# Verificación del playtest

## Cámara cercana y fútbol táctico — comprobación local del 16 de octubre de 2026

El checkout incorpora el campo de 72 × 44, partido a ventana completa, cámara cercana con minimapa, trece modelos, ritmo integral y planes de equipo persistentes. Esta entrega es local; las publicaciones registradas en las secciones históricas corresponden a versiones anteriores.

| Comprobación | Evidencia de esta entrega |
| --- | --- |
| TypeScript | Aprobado: `node node_modules/typescript/bin/tsc --noEmit` |
| Simulación | **129 aprobadas**: `node node_modules/vitest/vitest.mjs run` |
| Build | Aprobado: `npm run build`; JS principal 106,93 kB (39,02 kB gzip), worker 45,35 kB y CSS 28,52 kB |
| Red | Aprobada: permisos de capitán, alineación sin mutar identidades, último plan pendiente, aplicación al reanudar, reconexión y revancha; conserva las regresiones de ocho humanos y saque |
| Carga | 16 clientes, dos salas, 31,891 s; máximo de simulación 2,97 ms, RTT máximo 225 ms, 15,6 KiB/s JSON por cliente; RTT simulado de 100/150/200 ms |
| Navegador | **10 aprobados** en 1,5 min, salida 0; `node node_modules/@playwright/test/cli.js test --config .artifacts/playwright-strategy.config.ts --workers=1`; registro en `.artifacts/arcade-browser-final.log` |
| Publicador | 9 pruebas locales aprobadas; no ejecutan una publicación real |

Las regresiones nuevas están en `tests/arcade.test.ts`. Cubren formaciones y puestos persistentes, permisos, alineación automática/manual, planes pendientes, reanudación y final de período, reconexión/revancha, dificultad según modo, pases elevados en los tres ritmos, dirección del tiro coincidente con la línea evaluada, gol en el último ciclo, poderes escalonados, protección visible y animaciones persistentes. La cámara tiene comprobaciones geométricas para 1366 × 768, 1920 × 1080 y 1024 × 768.

`tests/browser/arcade.spec.ts` usa la interfaz real para editar puestos y tácticas, comprueba que la cancha ocupe la ventana y ejercita el menú con un mando simulado. También recorre la reanudación por gol sobre WebSocket; después congela un estado preparado en el servidor de pruebas para revisar protección visible, pases elevados en las esquinas, minimapa e indicador fuera de pantalla. Las capturas de esos estados son pruebas visuales, no partidas humanas.

### Revisión visual

El agente inspeccionó las galerías de los trece modelos de [frente](../.artifacts/arcade-models-front.png), [espalda](../.artifacts/arcade-models-back.png) y [cancha](../.artifacts/arcade-models-pitch.png). Pikachu, Charizard, Blastoise, Venusaur, Gengar, Machamp, Alakazam, Snorlax, Lapras, Dragonite, Lucario, Greninja y Ditto conservan rasgos propios a través de esas vistas. Son modelos geométricos originales y simplificados.

Capturas del partido: [jugada individual a 1366 × 768](../.artifacts/arcade-match.png), [portátil](../.artifacts/arcade-laptop.png), [Manto nocturno](../.artifacts/arcade-ghost.png), [esquina y pelota elevada](../.artifacts/arcade-corner.png). A 1366 × 768 la figura de Pikachu mide aproximadamente 63 px de alto; el test exige más de 48 px y verifica ausencia de scroll. El minimapa mide 216 × 142 px.

### Unidades de cambio y reversión

No hay metadatos Git en este checkout. Las unidades siguientes mantienen el comportamiento junto a su validación. Los contratos de estado son compartidos: antes de retirarlos hay que retirar sus consumidores del cliente/servidor.

| Unidad | Límite de cambio | Verificación |
| --- | --- | --- |
| Ritmo y protección visible | `tuning.ts`, geometría, modo y campos de Fighter; movimiento, balón, habilidades y colisiones | Pruebas de ritmo, pases, ghost y antistun; simulación larga y carga |
| Planes e IA | `team-plan.ts`, planes y reanudaciones en estado/motor, `tactics.ts`, `ai.ts` | Puestos, cobertura, estilos, permisos, reconexión y fases en unitarias/red |
| Presentación | `match-camera.ts`, `gl.ts`, `models.ts`, `scene.ts` y CSS del partido | Geometría de cámara, modelos desde tres vistas, HUD, esquinas y minimapa |
| Interacción y transporte | Comandos nuevos en worker/servidor; lobby, tácticas y menús con mando en `main.ts`/`input.ts` | Browser, worker individual sin red y WebSockets reales |

### Límites de la validación

Se utilizó Node 24.21.0 y Chromium con SwiftShader por software. La muestra del build estático registró **21 FPS** y cinco llamadas de dibujo a 1440 × 1000; no demuestra 60 FPS con GPU. Los flujos usaron los servidores locales ya abiertos para evitar la espera de apagado de Playwright en Windows. La prueba de mando sustituye `navigator.getGamepads`; no se conectó un mando físico. Las métricas de carga son locales, sin pérdida real de red ni CPU de Render.

Faltan partidas humanas para evaluar la sensación de ritmo y equilibrio, rendimiento con GPU física y sesiones desde Perú con amigos. El diseño y las pruebas deterministas no sustituyen esas comprobaciones.

## Historial de verificaciones anteriores

## Jugabilidad estratégica — comprobación local del 14 de octubre de 2026

Implementados campo de 60 × 36, ritmo configurable, dificultad compartida, roles tácticos, transferencias de posesión y saque temporal de Ditto. Los cambios de esta sección están en el checkout local; la publicación descrita más abajo corresponde a una versión anterior.

| Comprobación | Evidencia actual |
| --- | --- |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit`: aprobado |
| Unitarias | `node node_modules/vitest/vitest.mjs run`: **96 aprobadas**, incluidas 38 nuevas de estrategia |
| Build | `node node_modules/vite/bin/vite.js build --config apps/client/vite.config.ts apps/client`: aprobado |
| Publicador | `node --test tests/publish.test.mjs`: **9 aprobadas**; no publica servicios reales |
| Red | `node --experimental-strip-types tests/network.ts`: aprobado; autorización de ajustes, listos invalidados, reconexión con ajustes, ocho humanos, saque y rechazo de época antigua |
| Carga | `node --experimental-strip-types tests/load.ts`: aprobado; 16 conexiones, dos salas, RTT simulado de 100/150/200 ms, descanso, final, revancha y reinicio |
| Navegador | **8 aprobados en 1,1 min**, salida 0; registro en `.artifacts/strategy-browser-final.log` |

Se usaron las entradas Node de los comandos de `package.json` porque el ejecutor de shell no pudo iniciar. Node **24.21.0**, dependencias del lockfile y Chromium con SwiftShader. La primera ejecución del navegador completó ocho flujos pero quedó esperando al apagar los servidores de Playwright en Windows. La repetición usa `.artifacts/playwright-strategy.config.ts`, que conserva las opciones del repositorio y utiliza los servidores ya abiertos.

Las regresiones cubren robo, rebote, recepción, prioridad del pasador, cambio manual, intercepciones, varios humanos, reanudación de saque inicial y pulsaciones sostenidas. Para Ditto verifican captura, reloj activo, orientación sin movimiento, Q bloqueado, raso/elevado/despeje, saque rápido disputable, retorno a un puesto libre, retirada de humanos, exclusión con dash/teletransporte, contador, desconexión y cierre en descanso/final/reinicio. Las tácticas verifican amplitud, cobertura, apoyo adelantado, un presionante estable, un recolector, decisión de pase, ausencia de seguimiento de invisibles y simetría tras el entretiempo. Se conservan las simulaciones largas deterministas con goles y se añaden partidos completos en las tres dificultades.

La revisión visual del agente comprobó las capturas `.artifacts/strategy-keeper.png`, `.artifacts/strategy-field-laptop.png` y `.artifacts/lobby-laptop.png`: cancha completa, indicador propio, destinatario, contador y controles. El encuadre también tiene comprobaciones matemáticas para cuatro proporciones de pantalla. El mando se verifica con `navigator.getGamepads` simulado; el HUD se prueba contra una captura preparada en el servidor de pruebas.

La carga final duró **31,821 s**: máximo de simulación **28,18 ms** para ambas salas (límite del test: 33,3 ms), RTT máximo **231 ms** y **12,1 KiB/s** JSON sin comprimir por cliente. Se ejecutó junto a pruebas de navegador y red, por lo que incluye contención local; no representa latencia desde Perú ni CPU de Render. El build final ronda 84 kB de JavaScript principal, 38 kB de worker y 22 kB de CSS. El navegador midió **33 FPS** y cinco llamadas de dibujo con render por software.

### Unidades y límites de reversión

El directorio de trabajo no contiene `.git`; el commit se prepara en un checkout aislado bajo `.artifacts/strategy-release-*`, conservando el historial del repositorio publicado. Los cambios de estrategia forman una entrega integrada con sus pruebas y documentación. Los límites siguientes describen comportamientos y símbolos, para conservar cambios ajenos al revertir. Geometría y contratos son base de las unidades posteriores; hay que retirar primero sus consumidores.

| Unidad | Archivos y límite de reversión | Verificación del límite en ejecución |
| --- | --- | --- |
| Geometría y ajustes | `geometry.ts`; `MatchSettings`, `configure` y factor de carrera en `types.ts`, `state.ts`, `engine.ts`; límites en `physics.ts`/`abilities.ts`; consumidores en `gl.ts`, `scene.ts`, worker y servidor | Pruebas de geometría/predicción en `strategy.test.ts`; configuración por WebSocket y worker en red/navegador |
| Transferencia y saque | Funciones de posesión en `state.ts`, captura en `ball.ts`, `keepers.ts`, puertas de acciones y retirada en `engine.ts`, restricciones en `abilities.ts` y HUD de Ditto en `main.ts` | Regresiones de control/saque; ocho humanos en red; HUD y saque por teclado en navegador |
| Tácticas y dificultad | `tactics.ts`, decisiones en `ai.ts`, estado táctico y llamada en `engine.ts` | Partidos completos deterministas, simetría, invisibilidad, líneas de pase, cobertura y carga de dos salas |
| Lobby y controles | Presets y filtrado en `input.ts`; selectores, ayuda y HUD en `main.ts`; estilos añadidos en `style.css`; textos de README/arquitectura | Presets persistentes, reasignación, mando simulado, permisos de anfitrión y captura visual |

### Playtesting humano pendiente

Estas comprobaciones automatizadas y capturas no son partidas humanas. No se pudo completar una sesión humana ni usar un mando físico en esta ejecución.

| Prueba humana | Qué registrar |
| --- | --- |
| Ritmo | Jugar con 75/90/105 %, comparar lectura del juego, sprint y tamaño aparente de jugadores |
| Apoyos | Observar amplitud, cobertura y desmarque en los tres niveles, también después del entretiempo |
| Saque | Atacante frente a Ditto, saque rápido y a los ocho segundos, pase raso/elevado, despeje y retorno de control con amigos |

Mantener pendientes las pruebas desde Perú con red real, mando físico y rendimiento con GPU. La sensación de juego y el equilibrio requieren esa validación.

## Evidencia anterior a la jugabilidad estratégica

Comprobado el **14 de octubre de 2026** en Windows, con Node.js 24.21.0 y Chromium de Playwright. Las pruebas locales se complementaron con la publicación real en Render, verificada por el comando ejecutado en la terminal del usuario el mismo día a las 18:50 UTC.

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

## Publicación en Render

El comprobante local `.artifacts/publication.json` registra estado `verified` para el commit [`c78bed1`](https://github.com/SebastianBerrios/pokesoccer/commit/c78bed1e615ca04abe56ee0e6ec71d2fd8d90226).

- [Juego](https://pokesoccer-web.onrender.com): build estático desplegado y página comprobada.
- [Servidor](https://pokesoccer-server.onrender.com/health): servicio Free desplegado; salud y capacidad de dos salas comprobadas.
- Dos clientes WebSocket crearon una sala, entraron en equipos opuestos, iniciaron el partido y verificaron movimiento y diez personajes con arqueros bot. La sala de prueba se cerró al terminar.
- El publicador activó los despliegues automáticos por commit tras completar las comprobaciones.

Esta evidencia procede del publicador ejecutado en la terminal del usuario y su comprobante. La herramienta web del agente no pudo volver a consultar estas URL. Todavía no se ha probado una sesión humana completa en producción.

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

- Latencia y estabilidad desde Perú con amigos, incluyendo desconexiones de red reales.
- Rendimiento con GPU física, mando físico y navegadores distintos de Chromium.
- Ajuste de equilibrio y sensación de juego mediante partidas humanas.

El lockfile incluye las dependencias opcionales de Linux y otras plataformas, obtenidas de metadatos originales presentes en la caché. La comprobación local `npm ci --dry-run` valida consistencia. El despliegue posterior en Render completó la instalación y el build en su entorno Linux.
