import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production (Render), serve the pre-built React frontend from the same process.
// The Vite build output lands at artifacts/ttb-label-review/dist/public relative to
// the project root, which is process.cwd() when started by Render's start command.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(
    process.cwd(),
    "artifacts/ttb-label-review/dist/public",
  );
  app.use(express.static(frontendDist));
  // SPA fallback — any non-API route serves index.html so client-side routing works.
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
