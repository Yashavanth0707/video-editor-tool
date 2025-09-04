import { useState, useRef, useEffect } from "react";
import {
  openInput,
  generateThumbnails,
  sampleWaveform,
} from "../utils/mediabunnyUtils";
import { exportTimeline } from "../utils/mediabunnyUtils";
import type { Clip } from "../modal/editorTypes";
import VideoTimelineEditor from "./VideoTimelineEditor";

export default function Editor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function onAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const { input, video, audio } = await openInput(file);
      console.log("input", input, "video", video, "audio", audio);
      const thumbs = video ? await generateThumbnails(video, 20, 160) : [];
      //   console.log("thumbs", thumbs[0]);
      const wave = audio ? await sampleWaveform(audio, 1000) : [];
      let dur = 0;
      if (video) {
        const startTime = await video.getFirstTimestamp();
        const endTime = await video.computeDuration();
        dur = endTime - startTime;
      } else if (audio) {
        const startTime = await audio.getFirstTimestamp();
        const endTime = await audio.computeDuration();
        dur = endTime - startTime;
      }

      console.log("dur", dur);

      const url = URL.createObjectURL(file);
      setDuration(dur);
      setClips((cs) => [
        ...cs,
        {
          id: crypto.randomUUID(),
          file,
          srcURL: url,
          in: 0,
          out: dur,
          start: 0,
          track: 0,
          hasAudio: !!audio,
          overlays: [],
        },
      ]);
    }
  }

  // Draw video frames onto canvas
  useEffect(() => {
    if (!clips.length) return;
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    const video = videoRef.current;
    if (!canvas || !ctx || !video) return;

    let frameId: number;

    const draw = () => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      frameId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(frameId);
  }, [clips]);

  async function onExport() {
    const canvas = previewRef.current!;
    const blob = await exportTimeline(clips, canvas.width, canvas.height);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edit";
    a.click();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  }

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Number(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }

  return (
    <div className="h-screen w-full" style={{ padding: "20px" }}>
      <input
        type="file"
        accept="video/*,audio/*"
        multiple
        onChange={onAddFiles}
      />

      {/* Hidden video element (decodes frames) */}
      {clips.length > 0 && (
        <video
          ref={videoRef}
          src={clips[0].srcURL}
          style={{ display: "none" }}
          crossOrigin="anonymous"
        />
      )}

      {/* Canvas preview */}
      <canvas
        ref={previewRef}
        width={1280}
        height={720}
        style={{ border: "1px solid #ccc", marginTop: "10px" }}
      />

      {/* Controls */}
      <div style={{ marginTop: "10px" }}>
        <button onClick={togglePlay}>{isPlaying ? "Pause" : "Play"}</button>
        <button onClick={onExport} style={{ marginLeft: "10px" }}>
          Export
        </button>
      </div>

      {/* Your timeline UI goes here */}
      <VideoTimelineEditor />
    </div>
  );
}
