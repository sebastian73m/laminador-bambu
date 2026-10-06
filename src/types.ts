export interface Config {
  engine: string;
  projects: string;
  jobs: string;
  timeoutMs: number;
  maxConcurrent: number;
  maxSegments: number;
  maxFileBytes: number;
  maxExpandedBytes: number;
  maxJobs: number;
}
export interface SliceInput {
  project: string;
  plate: number;
  machine?: string;
  process?: string;
  filaments?: string[];
}
export type JobState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export interface JobSummary {
  id: string;
  state: JobState;
  project: string;
  plate: number;
  createdAt: string;
  message: string;
  log: string;
  output?: string;
}
export type Vec3 = [number, number, number];
export interface Segment {
  a: Vec3;
  b: Vec3;
  layer: number;
  role: string;
  tool: number;
  speed: number;
  extruding: boolean;
  width: number;
  height: number;
}
export interface FilamentUsage {
  tool: number;
  lengthMm: number | null;
  volumeCm3: number | null;
  weightG: number | null;
  type?: string;
  color?: string;
}
export interface Statistics {
  printSeconds: number | null;
  totalSeconds: number | null;
  weightG: number | null;
  filaments: FilamentUsage[];
  source: "Bambu Studio" | "demostración" | "G-code";
}
export interface Layer {
  index: number;
  z: number;
  start: number;
  end: number;
}
export interface PlatePreview {
  id: number;
  name: string;
  segments: Segment[];
  layers: Layer[];
  statistics: Statistics;
  warnings: string[];
}
export interface SliceResult {
  plates: PlatePreview[];
  warnings: string[];
}
export type PlateSummary = Omit<PlatePreview, "segments"> & {
  segmentCount: number;
};
export function summarizePlate(p: PlatePreview): PlateSummary {
  const { segments, ...rest } = p;
  return { ...rest, segmentCount: segments.length };
}
