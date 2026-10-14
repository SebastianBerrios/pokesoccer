# PokeSoccer

Fútbol arcade 3D en el navegador, para jugar solo o con amigos por enlace. Cada equipo tiene **cuatro Pokémon de campo y un Ditto arquero automático**. De 1 a 8 personas por sala, hasta 4 por lado; los bots completan cualquier distribución.

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
| Mover y orientar | WASD | Stick izquierdo |
| Pase / pase elevado | J / L | A / Y |
| Cargar y soltar tiro; entrada sin pelota | K | X |
| Esquiva | Espacio | B |
| Sprint | Shift | RB |
| Cambiar a un compañero bot | Q | LT |
| Poder simple / normal / especial | 1 / 2 / 3 | LB + A / X / Y |
| Objeto | E | LB + B |
| Pausa individual | Escape | Botón de pausa en pantalla |

Puedes reasignar teclas desde **Cómo jugar**. Al completar un pase a un bot, tomas su control. Las cargas y objetos permanecen con cada Pokémon. Nunca se puede controlar al arquero ni quitarle un personaje a otra persona.

## Reglas del playtest

- Dos tiempos de cinco minutos de juego activo, diez segundos de descanso y cambio de lado. Empate: hasta dos minutos de gol de oro; si nadie marca, empate final.
- Cancha cerrada con rebotes, entradas, esquivas, tiro cargado y pase elevado. Sin faltas ni fuera de juego.
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
