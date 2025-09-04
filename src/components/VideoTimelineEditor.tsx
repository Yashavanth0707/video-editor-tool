import React, { useState } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import type {
  TimelineEffect,
  TimelineRow,
} from "@xzdarcy/react-timeline-editor";
// import "@xzdarcy/react-timeline-editor/dist/style.css";

export default function VideoTimelineEditor() {
  const [rows, setRows] = useState<TimelineRow[]>([
    {
      id: "track-1",
      actions: [{ id: "action-1", start: 0, end: 5, effectId: "effect-1" }],
    },
  ]);

  const effects: Record<string, TimelineEffect> = {
    "effect-1": { id: "effect-1", name: "Clip 1" },
  };

  return (
    <div>
      <Timeline
        editorData={rows}
        effects={effects}
        onChange={(newRows) => {
          console.log("Updated timeline data:", newRows);
          setRows(newRows);
        }}
      />
    </div>
  );
}
