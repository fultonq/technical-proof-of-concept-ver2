import { Router, type IRouter } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { analyzeLabel, buildBatchSummary } from "../lib/label-analyzer.js";
import { getLabelById, getSession, deleteSession } from "../lib/session-store.js";
import { batchProcess } from "@workspace/integrations-anthropic-ai/batch";
import { generateLabelSvg } from "../lib/label-generator.js";
import type { LabelImage } from "../lib/claude-vision.js";

const router: IRouter = Router();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WEBP are allowed.`));
    }
  },
});

// Accepts:
//   field "file"     — front label image (required)
//   field "backFile" — back label image (optional)
// When backFile is supplied, both images are sent to Claude Vision in one message so
// fields split across front/back panels (e.g. gov warning on back) are extracted correctly.
router.post(
  "/v1/labels/upload",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "backFile", maxCount: 1 },
  ]),
  async (req, res) => {
    const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined;
    const frontFile = filesMap?.["file"]?.[0];
    const backFile = filesMap?.["backFile"]?.[0];

    if (!frontFile) {
      res.status(400).json({ error: "No file uploaded. Provide a JPEG, PNG, or WEBP image." });
      return;
    }

    const sessionId = (req.body as Record<string, string>).sessionId ?? uuidv4();
    const expectedBrandName = (req.body as Record<string, string>).expectedBrandName ?? null;
    const expectedClassType = (req.body as Record<string, string>).expectedClassType ?? null;
    const expectedAlcoholContent = (req.body as Record<string, string>).expectedAlcoholContent ?? null;
    const expectedNetContents = (req.body as Record<string, string>).expectedNetContents ?? null;
    const expectedBeverageType = (req.body as Record<string, string>).expectedBeverageType || null;

    const images: LabelImage[] = [
      { buffer: frontFile.buffer, mimeType: frontFile.mimetype },
    ];
    if (backFile) {
      images.push({ buffer: backFile.buffer, mimeType: backFile.mimetype });
    }

    const fileName = backFile
      ? `${frontFile.originalname} + ${backFile.originalname}`
      : frontFile.originalname;

    try {
      const result = await analyzeLabel(images, fileName, {
        sessionId,
        expectedBrandName,
        expectedClassType,
        expectedAlcoholContent,
        expectedNetContents,
        expectedBeverageType,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Label analysis failed: ${message}` });
    }
  },
);

router.post(
  "/v1/labels/batch",
  upload.array("files", 50),
  async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded." });
      return;
    }

    const sessionId = (req.body as Record<string, string>).sessionId ?? uuidv4();

    try {
      const results = await batchProcess(
        files,
        async (file) => {
          return analyzeLabel(
            [{ buffer: file.buffer, mimeType: file.mimetype }],
            file.originalname,
            { sessionId },
          );
        },
        { concurrency: 2, retries: 3 },
      );

      const summary = buildBatchSummary(sessionId, results);
      res.json(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Batch analysis failed: ${message}` });
    }
  },
);

// Generates a realistic SVG beverage label from free-form label text.
// Returns { svg: string } — the client converts it to a PNG for compliance checking.
router.post("/v1/labels/generate-preview", async (req, res) => {
  const { labelText } = req.body as { labelText?: string };
  if (!labelText || !labelText.trim()) {
    res.status(400).json({ error: "labelText is required." });
    return;
  }
  if (labelText.length > 8000) {
    res.status(400).json({ error: "labelText must be under 8000 characters." });
    return;
  }
  try {
    const svg = await generateLabelSvg(labelText);
    res.json({ svg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Label image generation failed: ${message}` });
  }
});

router.get("/v1/labels/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const results = await getSession(sessionId);
    res.json(buildBatchSummary(sessionId, results ?? []));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to retrieve session: ${message}` });
  }
});

router.delete("/v1/labels/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    await deleteSession(sessionId);
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to delete session: ${message}` });
  }
});

router.get("/v1/labels/:labelId", async (req, res) => {
  const { labelId } = req.params;
  try {
    const result = await getLabelById(labelId);
    if (!result) {
      res.status(404).json({ error: "Label result not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to retrieve label: ${message}` });
  }
});

export default router;
