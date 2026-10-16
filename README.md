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
| Pausa individual | Escape | Start / Menu |
| Tácticas durante el partido | T | View / Select |

En **Cómo jugar** puedes elegir **Flechas + A/S/D**, conservar **WASD + J/K/L** o reasignar cada tecla. Las preferencias guardadas se mantienen. En los menús del partido, el mando usa arriba/abajo para enfocar, izquierda/derecha para cambiar opciones, A para aceptar y B para volver.

Cada recuperación, rebote o recepción de un bot aliado entrega el control al humano conectado más cercano. Un pase dirigido prioriza a su autor; Q cancela esa prioridad. Nunca se desplaza a otro humano. Después de cambiar, suelta y vuelve a pulsar las acciones para usarlas; las cargas y objetos siguen perteneciendo a cada Pokémon.

Cuando Ditto atrapa el balón, el humano más cercano dirige el saque durante **ocho segundos**: direcciones para apuntar, **A** raso, **D** elevado y **S** despeje largo (mando: **A / Y / X**). Ditto no camina, no usa poderes y Q no lo abandona. El reloj continúa. Los rivales salen automáticamente del área y no pueden reingresar hasta soltar el balón; puedes sacar antes de que terminen de retirarse. El pase ya puede disputarse al salir.

Un pase a un bot entrega su control al soltar. Al pasar a otro humano o despejar, vuelves al personaje anterior, o a un compañero libre si está ocupado. Al agotar el contador, Ditto elige una línea segura o despeja. Sin humano disponible o tras desconectarse el controlador, distribuye automáticamente tras un segundo desde la captura.

## Reglas del playtest

- Dos tiempos de **tres minutos** de juego activo, diez segundos de descanso y cambio de lado. Empate: hasta dos minutos de gol de oro; si nadie marca, empate final.
- Cancha de **72 × 44**, área de **8 × 12**, cámara cercana que sigue la jugada y minimapa con los diez personajes. El partido ocupa toda la ventana. Rebotes, entradas, esquivas, tiro cargado y pase elevado; sin faltas ni fuera de juego.
- El anfitrión elige ritmo y dificultad antes de iniciar. Cambiarlos invalida los listos; la revancha los conserva. El reloj y las duraciones de efectos no se ralentizan.
- En individual, tus aliados mantienen dificultad normal y los rivales usan la elegida. Online, todos los bots comparten dificultad. Comienza en equilibrado/normal.
- Formaciones **1-2-1, 2-2 y 1-1-2**; estilos **equilibrado, posesión y contraataque**. Los puestos se sugieren por atributos y se pueden intercambiar en el lobby sin cambiar de Pokémon ni de controlador.
- El capitán organiza su equipo; el anfitrión puede organizar un equipo sin humanos conectados. Durante el partido, **T** abre las tácticas: el último plan preparado se aplica en el próximo saque inicial, después de un gol o del descanso. Online el partido continúa.
- Los bots conservan su puesto de referencia, con cobertura temporal cuando alguien sale, un presionante y un recolector por equipo. La dificultad cambia reacción, presión, precisión y uso de poderes; los bots escalonan sus poderes normal y especial.
- Doce especies y Ditto con siluetas propias. Tres poderes por especie. **Manto nocturno** mantiene visibles a los cuatro aliados de campo durante 1,5 s y evita entradas/contacto rival; los poderes y las intercepciones siguen funcionando.
- Normal: carga mediante acciones de juego, con un límite contra la repetición de pases. Especial: recoge el orbe y prepara el poder durante 0,8 s; esa preparación se puede interrumpir. Aturdimiento máximo de 0,8 s, seguido por 1,2 s de protección.
- Objetos neutrales: baya de velocidad, escudo de un golpe y bomba. Salas privadas por código, entrada durante el partido y reconexión durante treinta segundos; dos salas por servidor.

| Ritmo | Carrera y sprint¹ | Balón¹ | Impulsos/proyectiles¹ | Recarga simple | Orbe | Objetos |
| --- | --- | --- | --- | --- | --- | --- |
| Lento | 55 % | 80 % | 70 % | 8 s | 45 s | 30 s |
| Equilibrado | 65 % | 90 % | 85 % | 7 s | 40 s | 25 s |
| Rápido | 80 % | 100 % | 100 % | 6 s | 35 s | 20 s |

¹ Factores sobre las velocidades base del motor. El sprint conserva su aceleración respecto a la carrera; los pases elevados ajustan su vuelo para alcanzar al receptor.

La pantalla de cada Pokémon explica sus tres poderes. Las reglas están en [catalog.ts](packages/game/src/catalog.ts), los ritmos en [tuning.ts](packages/game/src/tuning.ts) y las formaciones en [team-plan.ts](packages/game/src/team-plan.ts).

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
