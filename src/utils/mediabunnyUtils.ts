import {
  Mp4OutputFormat,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  Input,
  BlobSource,
  CanvasSink,
  AudioBufferSink,
  Conversion,
  Output,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
  MP4,
  QTFF,
  MATROSKA,
  WEBM,
  MP3,
  WAVE,
  OGG,
} from "mediabunny";
import type { Clip, RendererDeps } from "../modal/editorTypes";

export async function pickBestFormat() {
  // Prefer MP4 if H.264/AAC are encodable; otherwise fall back to WebM (VP8/Opus)
  const mp4 = new Mp4OutputFormat();
  const mp4V = await getFirstEncodableVideoCodec(mp4.getSupportedVideoCodecs());
  const mp4A = await getFirstEncodableAudioCodec(mp4.getSupportedAudioCodecs());
  if (mp4V && mp4A) return { format: mp4, v: mp4V, a: mp4A };

  const webm = new WebMOutputFormat();
  const webmV = await getFirstEncodableVideoCodec(
    webm.getSupportedVideoCodecs()
  );
  const webmA = await getFirstEncodableAudioCodec(
    webm.getSupportedAudioCodecs()
  );
  return { format: webm, v: webmV!, a: webmA! };
}

export async function openInput(file: File) {
  const input = new Input({
    formats: [MP4, QTFF, MATROSKA, WEBM, MP3, WAVE, OGG],
    source: new BlobSource(file),
  });
  // await input.init();
  // const video = input.getVideoTracks() ?? null;
  // const audio = input.getAudioTracks() ?? null;
  // return { input, video, audio };

  // Use the primary track methods from the documentation
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();

  return { input, video, audio };
}

export async function generateThumbnails(
  videoTrack: any,
  count = 30,
  width = 160
) {
  console.log("videoTrack", videoTrack);

  // Check if the video track can be decoded
  const decodable = await videoTrack.canDecode();
  if (!decodable) {
    console.warn("Video track cannot be decoded");
    return [];
  }

  const sink = new CanvasSink(videoTrack, { width }); // auto height

  // Use the correct method names from the documentation
  const startTimestamp = await videoTrack.getFirstTimestamp();
  const endTimestamp = await videoTrack.computeDuration();
  const duration = endTimestamp - startTimestamp;

  const stamps = Array.from(
    { length: count },
    (_, i) => startTimestamp + (i * duration) / (count - 1)
  );

  const images: string[] = [];

  try {
    for await (const wrapped of sink.canvasesAtTimestamps(stamps)) {
      const canvas = wrapped?.canvas as HTMLCanvasElement;
      if (canvas) {
        images.push(canvas.toDataURL("image/webp", 0.8));
      }
    }
  } catch (error) {
    console.error("Error generating thumbnails:", error);
  }

  return images;
}

export async function sampleWaveform(audioTrack: any, samples = 2000) {
  try {
    const sink = new AudioBufferSink(audioTrack);

    // Get the start and end timestamps
    const startTimestamp = await audioTrack.getFirstTimestamp();
    const endTimestamp = await audioTrack.computeDuration();
    const duration = endTimestamp - startTimestamp;

    const peaks: number[] = [];
    const stepSize = duration / samples;

    // Use the buffers method as shown in documentation
    for await (const { buffer, timestamp } of sink.buffers(
      startTimestamp,
      endTimestamp
    )) {
      let max = 0;

      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          max = Math.max(max, Math.abs(data[i]));
        }
      }

      peaks.push(max);

      // Break if we have enough samples
      if (peaks.length >= samples) break;
    }

    return peaks;
  } catch (error) {
    console.error("Error sampling waveform:", error);
    return [];
  }
}
export function renderFrame(deps: RendererDeps, timeline: Clip[], t: number) {
  const { ctx, canvas } = deps;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the active base clip for t
  const base = timeline.find(
    (c) => c.track === 0 && t >= c.start && t < c.start + (c.out - c.in)
  );
  if (base) {
    // simplest preview: drive a hidden <video> set to t - base.start + base.in,
    // then drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  // Overlays active at time t
  for (const clip of timeline) {
    clip.overlays?.forEach((o) => {
      if (t < o.start || t >= o.end) return;
      ctx.globalAlpha = o.opacity ?? 1;
      if (o.type === "text") {
        ctx.font = "24px Inter";
        ctx.fillText(o.text, o.x, o.y);
      } else if (o.type === "image") {
        ctx.drawImage(o.img, o.x, o.y);
      }
      ctx.globalAlpha = 1;
    });
  }
}

export async function exportTrimmed(input, format, v, a, clip: Clip) {
  const out = new Blob();
  const targetChunks: Uint8Array[] = [];

  const conv = new Conversion({
    input,
    output: {
      format,
      target: { type: "stream", onChunk: (c) => targetChunks.push(c.data) },
    },
    video: {
      codec: v,
      quality: QUALITY_HIGH,
      trimStart: clip.in,
      trimEnd: clip.out,
    },
    audio: clip.hasAudio
      ? { codec: a, trimStart: clip.in, trimEnd: clip.out }
      : undefined,
  });

  await conv.run();
  return new Blob(targetChunks, { type: await conv.getMimeType() });
}

export async function exportTimeline(timeline: Clip[], w: number, h: number) {
  const { format, v, a } = await pickBestFormat();

  // 1) Prepare output target (stream to chunks)
  const chunks: Uint8Array[] = [];
  const output = new Output({
    format,
    target: { type: "stream", onChunk: (c) => chunks.push(c.data) },
  });

  // 2) Create a canvas we will paint each frame to
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  // 3) Video track from canvas
  const vsrc = new CanvasSource(canvas, {
    codec: v,
    width: w,
    height: h,
    quality: QUALITY_HIGH,
    framerate: 30,
  });
  output.addVideoTrack(vsrc, { width: w, height: h });

  // 4) Audio track from a pre-mixed buffer (build with OfflineAudioContext)
  const audioBuffer = await mixAudioWithOfflineAudioContext(timeline); // your mixer
  const asrc = new AudioBufferSource(a, audioBuffer); // sequential
  output.addAudioTrack(asrc, {
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
  });

  // 5) Start the file
  await output.start();

  // 6) Iterate timeline at 30 FPS and add frames
  const fps = 30,
    dt = 1 / fps;
  const total = getTimelineDuration(timeline);
  for (let t = 0, i = 0; t < total; t += dt, i++) {
    drawCompositionFrame(ctx, timeline, t, w, h); // your renderer from step 6
    await vsrc.add(t, dt); // important: await for backpressure
  }

  // 7) Finalize
  await output.finalize();
  const mime = await output.getMimeType();
  return new Blob(chunks, { type: mime });
}
