// The keeper, kept alive by pm2. Steps and checks: docs/keeper.md.
//
//   pm2 start scripts/keeper-ecosystem.config.cjs && pm2 save
//   curl -s localhost:3101/health
//
// It runs beside the site as its own process, `warrant-keeper`, and reads its key from
// .env.keeper (mode 600), never from .env.local: the site's env must never hold a private
// key, and scripts/deploy-vm.sh refuses to deploy if it does. Deploys never upload, change
// or delete .env.keeper or var/ (both are excluded from the sync).
const path = require("node:path");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const logs = path.join(os.homedir(), ".pm2", "logs");

module.exports = {
  apps: [
    {
      name: "warrant-keeper",
      cwd: root,
      script: "npx",
      args: "tsx scripts/keeper.ts --send --watch --every=60",
      interpreter: "none",
      env: {
        KEEPER_ENV_FILE: ".env.keeper",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      autorestart: true,
      // A crash is restarted after 10 s. Ten crashes inside a minute each means something is
      // wrong that a restart will not fix, and pm2 stops trying rather than spin.
      restart_delay: 10_000,
      min_uptime: "60s",
      max_restarts: 10,
      // pm2 stop sends SIGINT, then SIGKILL after this. The keeper exits at once on SIGINT.
      kill_timeout: 5_000,
      max_memory_restart: "300M",
      out_file: path.join(logs, "warrant-keeper-out.log"),
      error_file: path.join(logs, "warrant-keeper-error.log"),
      merge_logs: true,
    },
  ],
};
