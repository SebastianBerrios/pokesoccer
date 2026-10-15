# Publicar en Render

Desde la carpeta del proyecto, ejecuta en PowerShell:

```powershell
node scripts/publish.mjs
```

Necesitas Node.js 24, Git, GitHub CLI con la sesión de `SebastianBerrios` iniciada y Render conectado a esa cuenta de GitHub. Pega la API key de Render cuando el comando la solicite: la entrada queda oculta y la clave se mantiene solo en memoria.

El comando sube el código a [SebastianBerrios/pokesoccer](https://github.com/SebastianBerrios/pokesoccer), crea un servidor de salas **Free** en Virginia y un sitio estático, configura sus URL reales y verifica una partida online con dos clientes. Al finalizar muestra **PUBLICACIÓN VERIFICADA** y el enlace para jugar.

**Última publicación comprobada, anterior a la jugabilidad estratégica:** publicada y verificada el 14 de octubre de 2026 a las 18:50 UTC mediante el publicador ejecutado en la terminal del usuario. [Abrir el juego](https://pokesoccer-web.onrender.com). El comprobante local `.artifacts/publication.json` registra el commit [`c78bed1`](https://github.com/SebastianBerrios/pokesoccer/commit/c78bed1e615ca04abe56ee0e6ec71d2fd8d90226), ambos servicios activos y la prueba online aprobada.

## Qué hace el comando

- Usa el repositorio existente. Si todavía no existe, lo crea privado. Publica una copia en `.artifacts/publish-*` y comprueba que el commit remoto coincide.
- Excluye dependencias, builds, archivos `.env` y artefactos privados. No guarda credenciales en Git ni en Render.
- Crea o reutiliza `pokesoccer-server` y `pokesoccer-web`. Rechaza servicios con otra configuración, otro repositorio o un plan de servidor distinto de Free.
- Configura `ALLOWED_ORIGINS` y `VITE_SERVER_URL` con las URL asignadas por Render, espera los builds anteriores y despliega el commit publicado.
- Comprueba el sitio, `/health`, la creación de sala y los controles de dos clientes. Después activa los despliegues automáticos por commit.

El flujo utiliza las API de [servicios](https://api-docs.render.com/reference/create-service) y [despliegues](https://api-docs.render.com/reference/create-deploy) de Render. Los servicios creados por este comando se administran directamente; no pertenecen a un Blueprint.

## Retomar después de un fallo

Ejecuta de nuevo `node scripts/publish.mjs`. Reutiliza los servicios compatibles y conserva los despliegues que ya estén en curso. Puede crear una nueva copia local y un nuevo despliegue, pero no duplica servicios.

El avance queda en `.artifacts/publication.json`: contiene el commit, los identificadores y las URL, sin claves. El estado `verified` indica que terminaron todas las comprobaciones. Si falla un build, revisa sus registros en Render antes de reintentar.

Si tu cuenta tiene varios workspaces, el comando te permite elegir uno. El archivo local opcional `.artifacts/publish-target.json` puede fijar `email` y `ownerId`; queda excluido de Git. En este equipo ya está configurada la cuenta indicada.

## Alternativa manual con Blueprint

Usa esta alternativa si todavía no has creado los servicios mediante el comando:

1. Sube las fuentes, `package-lock.json` y [render.yaml](../render.yaml) al repositorio.
2. En Render, crea un **Blueprint** desde ese repositorio.
3. Introduce provisionalmente `https://pokesoccer-web.onrender.com` en `ALLOWED_ORIGINS`.
4. Cuando Render asigne la URL real al sitio estático, copia su origen exacto, sin barra final, a `ALLOWED_ORIGINS` del servidor.
5. Abre el sitio, crea una sala y entra desde otro navegador. Comprueba que `https://TU-SERVIDOR.onrender.com/health` responde con `"ok":true`.

En el Blueprint, el frontend obtiene la URL pública del backend mediante `RENDER_EXTERNAL_URL`. Consulta [Blueprint YAML](https://render.com/docs/blueprint-spec) y [variables predeterminadas](https://render.com/docs/environment-variables).

## Límites del plan Free

El servidor gratuito se duerme tras quince minutos sin tráfico y puede tardar alrededor de un minuto en despertar. El cliente reintenta la conexión inicial durante noventa segundos y muestra el estado. Las 750 horas mensuales gratuitas se comparten entre los servicios del workspace. Consulta [los límites Free](https://render.com/docs/free).

El comando solo solicita el servidor Free y no cambia la facturación. Si Render exige información de pago, se detiene. Las cuotas y los posibles excesos dependen de la configuración de facturación de tu workspace; consulta [la explicación de Render](https://render.com/docs/faq).

Las salas viven en memoria: reiniciar o desplegar termina las partidas. La reserva de treinta segundos recupera una conexión perdida mientras ese proceso sigue vivo. Conserva una sola instancia del servidor.

## Actualizar y verificar

Ejecuta las verificaciones del [README](../README.md) antes de publicar. Programa las actualizaciones cuando no haya partidas. El comando de publicación también sirve para subir cambios posteriores desde esta carpeta.

Tras publicar, prueba una partida individual, una sala con amigos y una reconexión. Si falla la conexión online, revisa `VITE_SERVER_URL` y `ALLOWED_ORIGINS`. Cambiar la primera requiere reconstruir el frontend.

Para volver a una versión anterior, restaura una revisión compatible de frontend y servidor. No hay migraciones ni base de datos.

La compilación y el arranque en Render pasaron para esa versión anterior; la entrega estratégica debe volver a verificarlos tras publicarse. Falta medir la latencia y estabilidad desde Perú durante partidas con amigos; la prueba breve del publicador y las pruebas locales no sustituyen esa medición.
