export type BoundingBox = { x: number; y: number; width: number; height: number };
export type Detection = { id: string; className: string; score: number; box: BoundingBox };

export type ConditionType =
  | "brightness" | "blur" | "contrast" | "occlusion" | "noise" | "rotation" | "jpeg" | "lowlight"
  | "motionblur" | "crop" | "resize" | "haze" | "colorshift";
/** One image modification at one severity (0..100). A test case is an ordered list of steps. */
export type Step = { condition: ConditionType; severity: number };

export type ModelId = "coco-mnv2" | "coco-lite" | "yolos-tiny" | "detr-r50" | "owl-vit";
export type DetectSettings = { model: ModelId; tiled: boolean; queries: string[] };
/** Applied after detection, so moving it never needs a re-run. */
export type Thresholds = { conf: number };

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
/** Per baseline class: how many baseline detections existed and how many survived. */
export type ClassCounts = Record<string, { baseline: number; retained: number }>;

/** Compact per-object record of one run. st: r = retained, l = lost, n = new (not in baseline). */
export type Item = { st: "r" | "l" | "n"; cls: string; bid?: string; box?: [number, number, number, number]; score?: number; iou?: number };

export type SweepPoint = {
  condition: ConditionType; severity: number; metrics: Metrics | null; byClass?: ClassCounts; items?: Item[]; error?: string;
};
export type ComboResult = { steps: Step[]; metrics: Metrics | null; byClass?: ClassCounts; error?: string };

export type RealWorldResult = {
  condition: ConditionType; photoName: string; width: number; height: number;
  realCountRetention: number | null;
  simulated: { severity: number; countRetention: number | null }[];
  matchedSeverity: number | null;
  perClass: Record<string, { baseline: number; real: number; simulated: number }>;
  note: string;
};

export type ReproInfo = {
  appVersion: string; createdAt: string; modelId: ModelId; modelLabel: string; modelSource: string;
  libraries: Record<string, string>; tfBackend: string; userAgent: string;
  settings: DetectSettings; thresholds: Thresholds; matchIoU: number; localizationIoU: number;
  tiling: { min: number; max: number; overlap: number; maxTiles: number };
  imageHash: string; imageSize: [number, number];
  levels: number[]; conditions: Record<string, string[]>; // human-readable parameter per level
  comboSeed: number; noiseSeeds: Record<string, number>;
};

export type ExperimentSummary = {
  id: string; owner: string; shared: boolean; createdAt: string; title: string;
  imageName: string; imageHash: string; width: number; height: number;
  modelId: ModelId; modelLabel: string; overall: number | null; points: number; combos: number;
};
/** Everything needed to display, compare and repeat an experiment. Stored as JSON in the database. */
export type ExperimentData = {
  settings: DetectSettings; thresholds: Thresholds; matchIoU: number;
  baseline: Detection[]; points: SweepPoint[]; combos?: ComboResult[];
  single?: { steps: Step[]; metrics: Metrics | null };
  realWorld?: RealWorldResult; repro: ReproInfo; summaryText: string[];
};
export type Experiment = ExperimentSummary & ExperimentData;
export type SavedRun = ExperimentSummary;
