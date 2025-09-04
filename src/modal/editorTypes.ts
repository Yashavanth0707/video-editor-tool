export type Clip = {
  id: string;
  file: File;
  srcURL: string;
  in: number; // seconds in source
  out: number; // seconds in source
  start: number; // seconds on timeline
  track: number; // 0 = base video track
  hasAudio: boolean;
  overlays?: Array<
    | {
        type: "text";
        text: string;
        x: number;
        y: number;
        start: number;
        end: number;
        opacity?: number;
      }
    | {
        type: "image";
        img: HTMLImageElement;
        x: number;
        y: number;
        start: number;
        end: number;
        opacity?: number;
      }
  >;
};

export type RendererDeps = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // per-clip helpers (e.g., a <video> element or a CanvasSink.getCanvasAtStamp cache)
};
