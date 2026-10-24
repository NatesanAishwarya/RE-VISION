export type BoundingBox = { x: number; y: number; width: number; height: number };
export type Detection = { id: string; className: string; score: number; box: BoundingBox };
export type ConditionType = "brightness" | "blur" | "contrast" | "occlusion";
export type Status = "retained" | "lost" | "new";
export type DetectionComparison = {
  status: Status;
  baseline?: Detection;
  modified?: Detection;
  iou?: number;
  confidenceDelta?: number;
  boxShiftPx?: number;
  localizationChanged?: boolean;
};
export type Metrics = {
  baselineCount: number;
  modifiedCount: number;
  matchedCount: number;
  lostCount: number;
  newCount: number;
  retentionRate: number | null;
  meanConfidenceDelta: number | null;
  meanIoU: number | null;
  localizationChangedCount: number;
};
export type SweepPoint = { condition: ConditionType; severity: number; metrics: Metrics | null; error?: string };
export type SavedRun = {
  id: string; createdAt: string; imageName: string; width: number; height: number;
  model: string; scoreThreshold: number; iouThreshold: number;
  baseline: Detection[]; points: SweepPoint[]; image: Blob;
};
