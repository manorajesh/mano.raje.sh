import React, { useEffect } from "react";
import { DimKey } from "./model";
import { View } from "./scene";

// A short walk through the tool, over the drawing. Each step can point at a dimension (which
// lights up in the drawing with the part it changes), set the tilt, or switch the view.

type Step = { title: string; body: string; focus?: DimKey; tilt?: number; view?: View };

const STEPS: Step[] = [
  {
    title: "The drawing",
    body:
      "The drawing shows the current design to scale: the kettle on its base and the cup in front. The solid kettle is tipped to its stop; the dashed one is it standing. The lines show predicted trajectories. The bar on the rim shows the estimated landing range. Blue means the range fits inside the cup. Orange marks a failed stream check.",
    view: "side",
    tilt: 1,
  },
  {
    title: "Dimensions",
    body:
      "Each label is a dimension. Drag it along its line to change it, or use the sliders and number boxes in the panel. Hover any of them to light up what it measures and the part it changes, with a line underneath saying what changing it does.",
    focus: "spoutL",
  },
  {
    title: "The rest follow",
    body:
      "When you change one dimension, the unlocked ones move as little as they can to keep the water landing in the cup. Try dragging the cup distance: the kettle tips further to reach it.",
    focus: "cupDist",
  },
  {
    title: "Locks",
    body:
      "Click a lock, on a label or in the list, to hold a dimension still. Locked dimensions never move. The one you set last also holds still until you set another.",
    focus: "cupH",
  },
  {
    title: "Tipping angle",
    body:
      "The kettle pivots on the front edge of its base. The tipping angle, marked at the pivot, is how far it turns from standing before it stops, measured between the top of the base and the kettle's bottom. Drag it there, or scrub the Tilt slider under the drawing to watch it go over and see the stream at each angle.",
    focus: "tilt",
    tilt: 0.5,
  },
  {
    title: "When it can't pour",
    body:
      "If too much is locked to keep the water in the cup, the panel says what fails and by how much, and lists the locks in the way with the value each would need. Click one to unlock it and let it move.",
  },
  {
    title: "Pour",
    body:
      "Pour runs the physics in time. The kettle tips at the tipping speed, the water level rises to the spout, and the stream falls into the cup, counted as it lands or spills.",
    tilt: 1,
  },
  {
    title: "The numbers",
    body:
      "Starting fill is the amount in the kettle, up to its 32 US fl oz rating. The readouts give how much to fill it with, how fast it pours and how long it takes. The checks list what has to hold; turn off the ones that don't apply. Switch to 3D to look around.",
  },
];

export default function Guide({
  step, onStep, onFocus, onTilt, onView,
}: {
  step: number;
  onStep: (s: number | null) => void;
  onFocus: (k: DimKey | null) => void;
  onTilt: (f: number) => void;
  onView: (v: View) => void;
}) {
  const s = STEPS[step];
  useEffect(() => {
    onFocus(s.focus ?? null);
    if (s.tilt !== undefined) onTilt(s.tilt);
    if (s.view) onView(s.view);
  }, [s, onFocus, onTilt, onView]);
  useEffect(() => () => onFocus(null), [onFocus]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStep(null);
      if (e.key === "ArrowRight") onStep(step < STEPS.length - 1 ? step + 1 : null);
      if (e.key === "ArrowLeft" && step > 0) onStep(step - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, onStep]);

  return (
    <div className="kt-guide" role="dialog" aria-label="How to use this">
      <div className="kt-guide-head">
        <b>{s.title}</b>
        <span>
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <p>{s.body}</p>
      <div className="kt-guide-dots">
        {STEPS.map((_, i) => (
          <button key={i} className={i === step ? "kt-on" : ""} onClick={() => onStep(i)} aria-label={`Step ${i + 1}`} />
        ))}
      </div>
      <div className="kt-guide-nav">
        <button onClick={() => onStep(null)}>Close</button>
        <span>
          <button disabled={step === 0} onClick={() => onStep(step - 1)}>
            Back
          </button>
          <button className="kt-guide-next" onClick={() => onStep(step < STEPS.length - 1 ? step + 1 : null)}>
            {step < STEPS.length - 1 ? "Next" : "Done"}
          </button>
        </span>
      </div>
    </div>
  );
}
