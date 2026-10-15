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
- Simple: 6 s. Normal: 100 puntos; pase completado, recuperación o tiro atajado dan 25, gol da 50. Máximo 50 por pases para cada Pokémon durante una posesión del equipo.
- Especial: orbe neutral cada 30 s; una carga no se acumula con otra. Preparación de 0,8 s, interrumpible, consumiendo al comenzar. Intentos inválidos no consumen.
- Aturdimiento máximo 0,8 s y protección posterior de 1,2 s; ralentización máxima 40 %. No hay daño ni tabla de debilidades.
- Reloj detenido durante saque inicial, gol y descanso. El saque del arquero mantiene el reloj activo. Cada gol suma uno.
- Bots usan los mismos movimientos, cargas, objetos y reglas que humanos. Ditto ataja automáticamente, sin poderes, y solo acepta control temporal para dirigir su saque.

## Geometría y ajustes compartidos

[geometry.ts](../packages/game/src/geometry.ts) define el campo de 60 × 36, área de 8 × 12, dimensiones de arcos y márgenes. Movimiento, rebotes, poderes, posiciones, objetos, estadio y cámara usan esta fuente. La cámara calcula un encuadre ortográfico para las esquinas y los indicadores, según la proporción del viewport.

El comando `configure` transporta `MatchSettings` por worker y WebSocket. `Game.configure` valida anfitrión conectado, lobby y valores permitidos, e invalida todos los listos. `rematch` conserva ajustes. `moveFighter` recibe las mismas opciones en servidor y predicción: solo carrera y sprint usan el factor de ritmo.

## Posesión y saque de Ditto

`catchBall` centraliza adquisiciones; `assignPossession` elige al humano y `transfer` renueva épocas. El motor exige una entrada sin pulsar cada acción antes de aceptar una nueva pulsación tras un relevo. El cliente también filtra pulsaciones sostenidas. Los reinicios renuevan épocas y asignan al sacador cuando es un bot.

`KeeperPossession` es un estado temporal dentro del partido activo, con captura, ocho segundos restantes, controlador, personaje anterior, destinatario y destinos de retirada. El arquero permanece inmóvil mientras retiene el balón. `keepers.ts` procesa raso/elevado/despeje y distribuye al vencer el contador; sin controlador espera un segundo desde la captura. Las opciones automáticas evalúan rivales visibles, distancia a la línea y espacio del receptor; si no hay línea segura, despejan elevado.

La retirada sustituye las entradas de rivales humanos y bots dentro del área. La restricción geométrica se aplica al movimiento, al teletransporte y tras cada subpaso de fuerzas/efectos. Soltar el balón elimina inmediatamente retirada y protección. Al pasar a un bot el control cambia al soltar; para otro humano o despeje se restaura el personaje anterior o uno libre. Desconectar activa distribución automática. Fin de período, gol, posiciones nuevas y final cierran el estado sin dejar humanos ligados a Ditto.

## Tácticas y dificultad

`tactics.ts` asigna espacios de referencia 1–2–1 a partir de posesión y posiciones humanas. Con balón conserva cobertura, amplitud y una opción adelantada; el portador ocupa un espacio y los demás se separan. Sin balón conserva un presionante válido, y el resto cubre espacios y líneas hacia rivales visibles. Solo un bot puede recoger un objeto, sin abandonar cobertura ni presión.

`ai.ts` usa esas asignaciones y evalúa líneas de pase y tiro antes de conducir hacia el arco. Los roles no consultan la especie. La dificultad solo cambia el intervalo de decisión: fácil 350–500 ms, normal 180–300 ms y difícil 100–160 ms, con la semilla compartida. Movimiento y sprint continúan entre decisiones, con las mismas reglas físicas. Un rival invisible no actualiza el foco: se usa la última posición visible.

## Red y límites

Cada proceso admite dos salas, hasta 32 conexiones de transporte, mensajes de 4 KiB, 100 mensajes por segundo y conexión con acumulación máxima de 256 KiB. Los códigos y tokens se generan con aleatoriedad criptográfica. El token de reconexión rota y queda en `sessionStorage`; no forma parte del enlace de invitación.

El apodo es texto, limitado a veinte caracteres y escapado al mostrarlo. El servidor valida comandos, equipos, selección, anfitrión y época. Los orígenes de navegador se restringen con `ALLOWED_ORIGINS`; conexiones nativas sin `Origin` siguen usando las mismas validaciones. Un código de sala permite participar: no representa una cuenta ni una identidad verificada.

Una desconexión libera el personaje a la IA y reserva el puesto humano durante treinta segundos. El anfitrión pasa a otro humano conectado. Si no quedan conexiones, la simulación deja de avanzar hasta reconectar; al expirar las reservas se elimina la sala.

## Decisiones de implementación

El plan inicial proponía Three.js y Colyseus. El entorno bloqueó la red de paquetes y esos módulos no estaban en caché. Se implementó un renderizador WebGL 2 con instancias agrupadas por cinco mallas básicas y un transporte WebSocket usando `ws`, disponible localmente. El motor y sus contratos permanecen separados de ambas decisiones.

Los doce modelos y el estadio se construyen con geometría propia, sin descargar sprites o modelos. Las miniaturas se renderizan con la misma geometría. El modo de calidad baja reduce detalles y resolución de dibujo. El sonido usa Web Audio.

## Unidades para revisar cambios futuros

Mantén las reglas junto a sus pruebas de simulación; el protocolo y servidor junto a las pruebas de red; y los cambios de interacción junto a la prueba de navegador correspondiente. Las pruebas de carga acortan los tiempos únicamente mediante opciones del servidor de pruebas: el servidor publicado siempre usa 300 segundos por tiempo y 120 de prórroga.
