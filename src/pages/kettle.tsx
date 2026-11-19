import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "../components/hot-air/hot-air.css";
import "../components/kettle/kettle.css";
import KettleTool from "../components/kettle/Tool";

// kettle: a kettle on a raised base tips about the base's front edge and pours into a cup in
// front of it. Every dimension can be dragged or locked; a solver keeps the rest pouring into
// the cup, and a physical model of the pour decides what "into the cup" means.

function Kettle() {
  useEffect(() => {
    const title = document.title;
    document.title = "kettle — mano";
    return () => {
      document.title = title;
    };
  }, []);

  return (
    <div className="ha-root kt-root">
      <div className="ha-col">
        <Link className="ha-home" to="/">← mano</Link>
        <h1>
          kettle <span>pour</span>
        </h1>
        <p className="ha-sub">
          Drag a dimension to hold it fixed while the designer adjusts the others. The kettle is rated for 32 US fl oz and tips up to 75°.
          A passing result is a prediction for the selected fill, pivot and tipping speed.
        </p>
      </div>

      <KettleTool />

      <div className="ha-col">
        <h2>How the pour is checked</h2>
        <p>
          The model assumes a vented kettle, a level water surface and a cup aligned with the spout.
          It estimates the water stored in the tilted body and the rising side of the spout. The driving head,
          bore, bends and pipe friction determine the estimated flow of hot water.
        </p>
        <p>
          As the kettle tips, the jet inherits the moving outlet’s velocity. The validator samples the stream
          during tipping and as the stationary kettle drains. It checks the footprint at the rim, including a
          0.15″ splash allowance and possible drops from the lip. Playback uses the same discharge history.
          The inlet sits flush with the floor. At the selected stop the neck must run downhill all the way
          to the lip, with zero predicted trapped bulk water. Playback stops within 0.01 mL of that limit.
          Body height allows 25% nominal headspace above the rated charge. The upright overflow check
          always uses the full 32 US fl oz, including when you simulate a smaller fill.
        </p>
        <h2>Before fabrication</h2>
        <p>
          Test a prototype with the intended spout bore, lip shape and finish. Use the indicated fill,
          pivot and cup position. Measure the nearest and farthest landing points while tipping and after stopping,
          then weigh what reaches the cup, what spills and what remains after draining. Repeat at the slowest and fastest expected tipping speeds.
        </p>
        <p className="ha-note">
          Sloshing, siphoning in a primed spout, surface wetting, sideways misalignment and fabrication tolerances
          can change the result. The splash allowance is a design assumption. Physical testing establishes
          the clearance your build actually needs.
        </p>
      </div>
    </div>
  );
}

export default Kettle;
