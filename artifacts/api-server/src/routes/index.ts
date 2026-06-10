import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import labelsRouter from "./labels.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(labelsRouter);

export default router;
