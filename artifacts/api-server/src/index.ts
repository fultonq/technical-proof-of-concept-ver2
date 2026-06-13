import app from "./app";
import { logger } from "./lib/logger";
import { initSessionStore, cleanupOldResults, getMaxAgeDays } from "./lib/session-store";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run cleanup immediately on startup, then every hour.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function scheduleCleanup(): void {
  cleanupOldResults().catch((err) => {
    logger.error({ err }, "Session store: cleanup run failed");
  });
  setInterval(() => {
    cleanupOldResults().catch((err) => {
      logger.error({ err }, "Session store: cleanup run failed");
    });
  }, CLEANUP_INTERVAL_MS).unref();
}

initSessionStore()
  .then(() => {
    scheduleCleanup();
    logger.info(
      { maxAgeDays: getMaxAgeDays(), intervalMinutes: CLEANUP_INTERVAL_MS / 60_000 },
      "Session store: cleanup scheduler started",
    );
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to database — exiting");
    process.exit(1);
  });
