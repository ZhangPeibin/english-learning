import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = await loadConfig();
const app = await buildApp(config);
await app.listen({ host: "127.0.0.1", port: config.port });
