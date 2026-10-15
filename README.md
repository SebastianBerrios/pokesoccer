# PokeSoccer

Fútbol arcade 3D en el navegador, para jugar solo o con amigos por enlace. Cada equipo tiene **cuatro Pokémon de campo y un Ditto que ataja automáticamente y permite dirigir el saque**. De 1 a 8 personas por sala, hasta 4 por lado; los bots completan cualquier distribución.

## Jugar en tu equipo

Necesitas Node.js 24 y un navegador de escritorio con WebGL 2.

```sh
npm ci --ignore-scripts
npm run dev
```

Abre **http://127.0.0.1:5173**. Elige **Jugar ahora**, arma tu equipo, marca **Estoy listo** y pulsa **A la cancha**. Para multijugador, usa **Invitar amigos** y comparte el enlace de la sala.

El enlace local funciona en este equipo. Para amigos por internet, sigue [Publicar en Render](docs/deployment.md).

La configuración opcional va en un archivo `.env` en la raíz, tomando [.env.example](.env.example) como referencia. Los valores predeterminados bastan para desarrollo. La partida individual se simula en un Web Worker; el servidor de salas solo interviene en multijugador.

## Controles

| Acción | Teclado | Mando estándar |
| --- | --- | --- |
| Mover y orientar | Flechas | Stick izquierdo |
| Pase / pase elevado | A / D | A / Y |
| Cargar y soltar tiro; entrada sin pelota | S | X |
| Esquiva | Espacio | B |
| Sprint | Shift | RB |
| Cambiar a un compañero bot | Q | LT |
| Poder simple / normal / especial | 1 / 2 / 3 | LB + A / X / Y |
| Objeto | E | LB + B |
| Pausa individual | Escape | Botón de pausa en pantalla |

En **Cómo jugar** puedes elegir **Flechas + A/S/D**, conservar **WASD + J/K/L** o reasignar cada tecla. Las preferencias guardadas se mantienen.

Cada recuperación, rebote o recepción de un bot aliado entrega el control al humano conectado más cercano. Un pase dirigido prioriza a su autor; Q cancela esa prioridad. Nunca se desplaza a otro humano. Después de cambiar, suelta y vuelve a pulsar las acciones para usarlas; las cargas y objetos siguen perteneciendo a cada Pokémon.

Cuando Ditto atrapa el balón, el humano más cercano dirige el saque durante **ocho segundos**: direcciones para apuntar, **A** raso, **D** elevado y **S** despeje largo (mando: **A / Y / X**). Ditto no camina, no usa poderes y Q no lo abandona. El reloj continúa. Los rivales salen automáticamente del área y no pueden reingresar hasta soltar el balón; puedes sacar antes de que terminen de retirarse. El pase ya puede disputarse al salir.

Un pase a un bot entrega su control al soltar. Al pasar a otro humano o despejar, vuelves al personaje anterior, o a un compañero libre si está ocupado. Al agotar el contador, Ditto elige una línea segura o despeja. Sin humano disponible o tras desconectarse el controlador, distribuye automáticamente tras un segundo desde la captura.

## Reglas del playtest

- Dos tiempos de cinco minutos de juego activo, diez segundos de descanso y cambio de lado. Empate: hasta dos minutos de gol de oro; si nadie marca, empate final.
- Cancha de **60 × 36**, área de **8 × 12**, con el campo completo visible. Rebotes, entradas, esquivas, tiro cargado y pase elevado. Sin faltas ni fuera de juego.
- El anfitrión elige el ritmo antes de iniciar: **lento 75 %**, **equilibrado 90 %** o **rápido 105 %** de la carrera original. Solo cambia carrera y sprint; conserva velocidades de balón, reloj, poderes y atajadas.
- Dificultad **fácil**, **normal** o **difícil** para todos los bots por igual. Comienza en equilibrado/normal. Cambiar ajustes invalida los listos; la revancha los conserva.
- Los bots reparten cobertura, amplitud y profundidad alrededor de los humanos, con un solo presionante y un solo recolector por equipo. Los roles no dependen de la especie.
- Doce especies, tres poderes por especie, con efectos de empuje, velocidad, barreras, proyectiles y control de zonas.
- Simple: seis segundos de recarga. Normal: acciones de juego, con un límite contra la repetición de pases. Especial: un orbe neutral cada treinta segundos y una preparación interrumpible de 0,8 segundos.
- Objetos neutrales cada veinte segundos: baya de velocidad, escudo de un golpe y bomba.
- Salas privadas por código; entrada durante el partido, relevo por bot al desconectar y reserva de reconexión de treinta segundos. Dos salas simultáneas por servidor.

La pantalla de cada Pokémon explica sus tres poderes. Los valores y descripciones están en [catalog.ts](packages/game/src/catalog.ts).

## Verificar y construir

```sh
npm run typecheck
npm test
npm run test:network
npm run test:publish
npm run test:load
npm run build
npx playwright install chromium
npm run test:browser
```

El build estático queda en `apps/client/dist`. `npm start` inicia únicamente el servidor de salas, por defecto en el puerto 2567; `/health` informa de su estado.

[Arquitectura](docs/architecture.md) explica simulación y sincronización. [Verificación](docs/verification.md) distingue pruebas ejecutadas de validaciones pendientes.

## Alcance

Este playtest incluye modelos 3D procedurales, sonido básico y mando mediante Gamepad API. Está diseñado para escritorio. No incluye cuentas, progreso persistente, matchmaking público, controles táctiles ni varios jugadores desde el mismo dispositivo.

La implementación utiliza TypeScript, Vite, WebGL 2 propio y WebSocket con `ws`. Se sustituyeron Three.js y Colyseus del diseño inicial porque no estaban disponibles en la caché del entorno y este bloqueaba las descargas externas.
