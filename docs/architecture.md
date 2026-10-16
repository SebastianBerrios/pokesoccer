# Arquitectura

La misma simulación autoritativa ejecuta los partidos individuales y online. El navegador envía controles, nunca posiciones, goles o cargas.

```text
Cliente: interfaz + render WebGL + controles
    ├── Solo → Web Worker → Game
    └── Online → WebSocket → sala en Node.js → Game
                              └── snapshots / deltas → clientes
```

## Fronteras

| Ruta | Responsabilidad |
| --- | --- |
| `packages/game/src` | Reglas, reloj, física, IA, poderes, estados y protocolo |
| `apps/client/src` | Interfaz, modelos, render, controles y transportes |
| `apps/server/src` | Salas, conexiones, reservas y difusión del estado |
| `tests` | Simulación, protocolo real, carga y flujos de navegador |

El motor avanza a 30 Hz con dos subpasos de física. El servidor difunde a 20 Hz, cuantiza los números y envía diferencias entre estados. El cliente interpola personajes remotos y predice el movimiento básico del propio; las confirmaciones del servidor corrigen esa predicción. Golpes, pelota y poderes siguen la autoridad del motor.

Cada personaje dispone de una época de control única. Cambiar a un bot, reconectar o iniciar una revancha renueva la época, y el motor rechaza entradas dirigidas al controlador anterior. Reconectar reinicia además la secuencia de entradas de esa sesión. Al incorporar un cliente, se renueva la base completa de snapshots antes de continuar con diferencias.

## Reglas que deben conservarse

- Diez personajes por sala: cuatro de campo y un arquero por equipo; como máximo cuatro humanos por lado.
- Un humano controla exactamente un personaje. Solo se transfiere a bots del mismo equipo. Las cargas y objetos no se transfieren.
- Toda adquisición de un bot de campo transfiere el control al humano conectado más cercano. El autor de un pase dirigido tiene prioridad mientras no cambie manualmente; los empates se resuelven por id y nunca se desplaza a otro humano.
- Simple: 6–8 s según el ritmo. Normal: 100 puntos; pase completado, recuperación o tiro atajado dan 25, gol da 50. Máximo 50 por pases para cada Pokémon durante una posesión del equipo.
- Especial: orbe neutral cada 35–45 s según el ritmo; una carga no se acumula con otra. Preparación de 0,8 s, interrumpible, consumiendo al comenzar. Intentos inválidos no consumen.
- Aturdimiento máximo 0,8 s y protección posterior de 1,2 s; ralentización máxima 40 %. No hay daño ni tabla de debilidades.
- Reloj detenido durante saque inicial, gol y descanso. El saque del arquero mantiene el reloj activo. Cada gol suma uno.
- Bots usan los mismos movimientos, cargas, objetos y reglas que humanos. Ditto ataja automáticamente, sin poderes, y solo acepta control temporal para dirigir su saque.

## Geometría, cámara y ritmo

[geometry.ts](../packages/game/src/geometry.ts) define el campo de 72 × 44, área de 8 × 12, arcos y márgenes. Movimiento, rebotes, poderes, posiciones, objetos y estadio usan esa fuente. [match-camera.ts](../apps/client/src/match-camera.ts) sigue la pelota y al jugador cercano con orientación fija a 45°, encuadre ortográfico de 44–52 unidades y suavizado independiente del FPS. Reserva espacio para el HUD, prioriza la pelota en pases largos y reinicia al reanudar. El minimapa conserva la visión global y un indicador señala al jugador propio fuera de cámara.

El comando `configure` transporta `MatchSettings` por worker y WebSocket. `Game.configure` valida anfitrión conectado, lobby y valores permitidos, e invalida todos los listos. `rematch` conserva ajustes. [tuning.ts](../packages/game/src/tuning.ts) centraliza factores de carrera, balón, impulsos y proyectiles, junto con recargas y apariciones. `moveFighter` comparte los mismos ajustes con la predicción del cliente. El reloj avanza con el paso fijo original; los pases elevados compensan la duración del vuelo.

Los modelos se dibujan siempre, incluido Manto nocturno: el estado `ghost` solo evita entradas y contacto corporal rival de los jugadores de campo, durante 1,5 s. Se representa con transparencia tramada, aros y etiquetas; no oculta al jugador ni a la IA. Las paredes de habilidades también usan tramado para conservar la lectura. `action`, `actionStarted` y `actionUntil` conservan la animación de pase, tiro, entrada, esquiva, poder y golpe entre snapshots.

## Posesión y saque de Ditto

`catchBall` centraliza adquisiciones; `assignPossession` elige al humano y `transfer` renueva épocas. El motor exige una entrada sin pulsar cada acción antes de aceptar una nueva pulsación tras un relevo. El cliente también filtra pulsaciones sostenidas. Los reinicios renuevan épocas y asignan al sacador cuando es un bot.

`KeeperPossession` es un estado temporal dentro del partido activo, con captura, ocho segundos restantes, controlador, personaje anterior, destinatario y destinos de retirada. El arquero permanece inmóvil mientras retiene el balón. `keepers.ts` procesa raso/elevado/despeje y distribuye al vencer el contador; sin controlador espera un segundo desde la captura. Las opciones automáticas evalúan rivales visibles, distancia a la línea y espacio del receptor; si no hay línea segura, despejan elevado.

La retirada sustituye las entradas de rivales humanos y bots dentro del área. La restricción geométrica se aplica al movimiento, al teletransporte y tras cada subpaso de fuerzas/efectos. Soltar el balón elimina inmediatamente retirada y protección. Al pasar a un bot el control cambia al soltar; para otro humano o despeje se restaura el personaje anterior o uno libre. Desconectar activa distribución automática. Fin de período, gol, posiciones nuevas y final cierran el estado sin dejar humanos ligados a Ditto.

## Tácticas y dificultad

[team-plan.ts](../packages/game/src/team-plan.ts) define las posiciones de 1-2-1, 2-2 y 1-1-2 y los estilos equilibrado, posesión y contraataque. `TeamPlan.lineup` asigna los cuatro slots a esas posiciones; no cambia id, especie ni controlador. La sugerencia automática maximiza atributos entre las 24 permutaciones. Cualquier especie puede ocupar cualquier puesto. Al cambiar formación en juego se minimiza la distancia entre posiciones usando siempre el plan activo.

`configureTeam` permite cambiar formación/estilo al capitán conectado, o al anfitrión para un equipo sin humanos conectados. En el lobby se aplica inmediatamente e invalida los listos de ese equipo. Durante un partido reemplaza `pendingTeamPlans`; volver al plan activo cancela el pendiente. `lineup` permite intercambios o recuperar la sugerencia automática solo en el lobby.

El motor aplica ambos pendientes en `resetPositions`, al finalizar la cuenta atrás del saque, y renueva las épocas una sola vez. Los goles conservan posiciones durante la celebración. Si termina el período, pasa al descanso antes de reposicionar; no crea un saque intermedio. Reconectar conserva planes activos/pendientes. La revancha conserva los activos y elimina los pendientes.

`tactics.ts` parte de posiciones estables: una cobertura detrás de la pelota, bandas y profundidad. Solo el presionante abandona el bloque para disputar. Hay sustituciones temporales de cobertura y desmarque, con regreso al puesto al cambiar la situación. Un solo bot recoge objetos sin abandonar cobertura ni presión. Posesión acorta apoyos y favorece devoluciones; contraataque baja el bloque y busca salidas verticales.

`ai.ts` evalúa líneas de pase/tiro y conduce hacia el arco. `BOT_PROFILES` controla reacción (fácil 400–600 ms, normal 220–340 ms, difícil 120–200 ms), entradas, distancia de presión, error de tiro y uso de poderes mediante la semilla compartida. Movimiento y sprint continúan entre decisiones. La ventana `powerReadyAt` escalona poderes normales/especiales entre bots del mismo equipo, sin limitar a humanos.

`MatchState.mode` identifica individual/online explícitamente: el worker crea `solo` y el servidor `online`. En individual los aliados usan normal y los rivales la dificultad elegida; online ambos equipos usan la misma. El número de humanos conectados no cambia el modo.

## Red y límites

Cada proceso admite dos salas, hasta 32 conexiones de transporte, mensajes de 4 KiB, 100 mensajes por segundo y conexión con acumulación máxima de 256 KiB. Los códigos y tokens se generan con aleatoriedad criptográfica. El token de reconexión rota y queda en `sessionStorage`; no forma parte del enlace de invitación.

El apodo es texto, limitado a veinte caracteres y escapado al mostrarlo. El servidor valida comandos, equipos, selección, anfitrión y época. Los orígenes de navegador se restringen con `ALLOWED_ORIGINS`; conexiones nativas sin `Origin` siguen usando las mismas validaciones. Un código de sala permite participar: no representa una cuenta ni una identidad verificada.

Una desconexión libera el personaje a la IA y reserva el puesto humano durante treinta segundos. El anfitrión pasa a otro humano conectado. Si no quedan conexiones, la simulación deja de avanzar hasta reconectar; al expirar las reservas se elimina la sala.

## Decisiones de implementación

El plan inicial proponía Three.js y Colyseus. El entorno bloqueó la red de paquetes y esos módulos no estaban en caché. Se implementó un renderizador WebGL 2 con instancias agrupadas por cinco mallas básicas y un transporte WebSocket usando `ws`, disponible localmente. El motor y sus contratos permanecen separados de ambas decisiones.

Los trece modelos (doce especies y Ditto) y el estadio se construyen con geometría propia, sin descargar sprites o modelos. Las miniaturas se renderizan con la misma geometría. El modo de calidad baja reduce detalles y resolución de dibujo. El sonido usa Web Audio.

## Unidades para revisar cambios futuros

Mantén las reglas junto a sus pruebas de simulación; el protocolo y servidor junto a las pruebas de red; y los cambios de interacción junto a la prueba de navegador correspondiente. Las pruebas de carga acortan los tiempos únicamente mediante opciones del servidor de pruebas: los valores predeterminados son 180 segundos por tiempo y 120 de prórroga.
