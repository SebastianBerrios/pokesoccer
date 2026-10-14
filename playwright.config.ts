import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',timeout:45000,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:1000},headless:true,
    launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']}},
  webServer:[
    {command:'node --experimental-strip-types apps/server/src/index.ts',url:'http://127.0.0.1:2567/health',reuseExistingServer:true},
    {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --config apps/client/vite.config.ts apps/client',url:'http://127.0.0.1:5173',reuseExistingServer:true}
  ],
  reporter:[['list']],outputDir:'.artifacts/browser-results'
});
