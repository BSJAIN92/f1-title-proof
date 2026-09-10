import {defineConfig,devices} from "@playwright/test";
const remote=process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({testDir:"./e2e",fullyParallel:false,reporter:"list",use:{baseURL:remote??"http://127.0.0.1:3100",trace:"retain-on-failure"},projects:[{name:"desktop",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:900}}},{name:"mobile",use:{...devices["Pixel 5"],viewport:{width:390,height:844}}}],webServer:remote?undefined:{command:"npm run start:convex:test",url:"http://127.0.0.1:3100",reuseExistingServer:!process.env.CI,timeout:120000}});
