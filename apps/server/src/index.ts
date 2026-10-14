import { createGameServer } from './server.ts';
const server=createGameServer({
  maxRooms:Math.max(1,Math.min(2,Number(process.env.MAX_ROOMS)||2)),
  allowedOrigins:process.env.ALLOWED_ORIGINS?.split(',').map(s=>s.trim()).filter(Boolean)
});
const port=await server.listen(Number(process.env.PORT)||2567,process.env.HOST||'0.0.0.0');
console.log('PokeSoccer server listening on '+port);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
