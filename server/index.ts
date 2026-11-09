import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { createProvider } from "./ai/index.ts";

const port = Number(process.env.KE_PORT ?? 5175);
const dataDir = resolve(process.env.KE_DATA_DIR ?? "data");
const provider = createProvider();
const prod = process.env.NODE_ENV === "production";

const { app } = await createApp({
  dataDir,
  provider,
  staticDir: prod ? resolve("dist") : undefined,
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Knowledge Explorer server on http://localhost:${port}${prod ? "" : " (API; open the Vite URL in dev)"}`);
  console.log(`Data folder: ${dataDir}`);
  console.log(
    provider.name === "demo"
      ? "AI: offline demo content (set ANTHROPIC_API_KEY to use Claude)"
      : `AI: ${provider.name} · ${provider.model}`,
  );
});
