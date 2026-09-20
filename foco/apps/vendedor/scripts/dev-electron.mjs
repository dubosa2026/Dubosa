import { spawn } from "node:child_process";
import waitOn from "wait-on";
import electronPath from "electron";

const devServerUrl = "http://localhost:5180";

await waitOn({ resources: [devServerUrl] });

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
});

child.on("close", (code) => process.exit(code ?? 0));
