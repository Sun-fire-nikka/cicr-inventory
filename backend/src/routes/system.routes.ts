import { Router } from 'express';
import { getBoteMetrics, getSimulateScale } from '../modules/system/system.controller';

const router = Router();

router.get('/bote-metrics', getBoteMetrics);
router.get('/simulate-scale', getSimulateScale);

export default router;
