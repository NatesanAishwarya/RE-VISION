import type { ModelId } from "../types/experiment";

export type ModelInfo = {
  id: ModelId; label: string; family: string; lib: "coco" | "hf"; kind: "closed" | "open";
  base?: "mobilenet_v2" | "lite_mobilenet_v2"; hfId?: string;
  vocabulary: string; sizeMB: number; speed: 1 | 2 | 3 | 4 | 5; accuracy: 1 | 2 | 3 | 4 | 5; blurb: string;
  /** Lowest score kept (the confidence slider filters above this). */
  floor: number; default: number; min: number; max: number;
};

export const MODELS: Record<ModelId, ModelInfo> = {
  "coco-mnv2": {
    id: "coco-mnv2", label: "COCO-SSD MobileNetV2", family: "SSD", lib: "coco", kind: "closed", base: "mobilenet_v2",
    vocabulary: "80 everyday classes", sizeMB: 14, speed: 4, accuracy: 3,
    blurb: "Balanced default. A single-shot detector running in the browser through TensorFlow.js.",
    floor: 0.2, default: 0.4, min: 0.2, max: 0.9,
  },
  "coco-lite": {
    id: "coco-lite", label: "COCO-SSD Lite", family: "SSD", lib: "coco", kind: "closed", base: "lite_mobilenet_v2",
    vocabulary: "80 everyday classes", sizeMB: 4, speed: 5, accuracy: 2,
    blurb: "Smallest and fastest, and the weakest. This was the prototype's first model, so it is a useful baseline.",
    floor: 0.2, default: 0.4, min: 0.2, max: 0.9,
  },
  "yolos-tiny": {
    id: "yolos-tiny", label: "YOLOS Tiny", family: "Vision transformer", lib: "hf", kind: "closed", hfId: "Xenova/yolos-tiny",
    vocabulary: "80 everyday classes", sizeMB: 25, speed: 3, accuracy: 3,
    blurb: "A small vision transformer used as a detector. Fails differently from SSD models, which is what makes it worth comparing.",
    floor: 0.2, default: 0.5, min: 0.2, max: 0.95,
  },
  "detr-r50": {
    id: "detr-r50", label: "DETR ResNet-50", family: "Transformer", lib: "hf", kind: "closed", hfId: "Xenova/detr-resnet-50",
    vocabulary: "80 everyday classes", sizeMB: 45, speed: 2, accuracy: 4,
    blurb: "Predicts a fixed set of objects end to end, with no hand-tuned overlap suppression, so it tends to cope better with crowds. Slowest closed-set model.",
    floor: 0.2, default: 0.7, min: 0.2, max: 0.98,
  },
  "owl-vit": {
    id: "owl-vit", label: "OWL-ViT (open vocabulary)", family: "Vision-language", lib: "hf", kind: "open", hfId: "Xenova/owlvit-base-patch32",
    vocabulary: "anything you type", sizeMB: 150, speed: 1, accuracy: 3,
    blurb: "Finds whatever words you give it, such as a rupee note, which closed-set models cannot name. Needs search words, and is the largest download.",
    floor: 0.03, default: 0.1, min: 0.03, max: 0.5,
  },
};
export const MODEL_LIST = Object.values(MODELS);
export const DEFAULT_MODEL: ModelId = "coco-mnv2";
export const modelLabelOf = (id: ModelId) => MODELS[id]?.label ?? id;
