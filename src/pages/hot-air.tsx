import React, { useEffect } from "react";
// import { Link } from "react-router-dom";
import "../components/hot-air/hot-air.css";
import RayDiagram from "../components/hot-air/RayDiagram";
import { Hero, useClips, Wipe } from "../components/hot-air/Clips";
import Rig3D from "../components/hot-air/Rig3D";
import Calib from "../components/hot-air/Calib";
// import Sync from "../components/hot-air/Sync";
import Training from "../components/hot-air/Training";
import Field from "../components/hot-air/Field";

// hot air: the warm air above a lighter, filmed by three phones against a retroreflective sheet
// and rebuilt as a 4D field. Data from github.com/manorajesh/hotair (tools/export_web.py).

function HotAir() {
  const clips = useClips();

  useEffect(() => {
    const title = document.title;
    document.title = "hot air — mano";
    return () => {
      document.title = title;
    };
  }, []);

  return (
    <div className="ha-root">
      <div className="ha-col">
        {/* <Link className="ha-home" to="/">← mano</Link> */}
        <h1>
          hot <span>air</span>
        </h1>
        <p className="ha-sub">The warm air above a lighter captured and rebuilt in 3D</p>
      </div>

      <figure className="ha-fig">
        <Hero meta={clips} />
      </figure>

      <div className="ha-col">
        <h2>Seeing air</h2>
        <p>Warm air bends light. Shine a point of light through it onto a screen and the bending shows up as light and dark lines.</p>
      </div>
      <figure className="ha-fig ha-fig-narrow">
        <RayDiagram />
        <figcaption>Drag the warm air.</figcaption>
      </figure>
      <div className="ha-col">
        <p>The screen is a retroreflective sheet. It sends light back the way it came, so each phone's own flash is enough.</p>
      </div>

      <div className="ha-col">
        <h2>One phone</h2>
        <p>Divide every frame by a frame of the empty sheet. Whatever didn't change disappears, and the air is left.</p>
      </div>
      <figure className="ha-fig ha-fig-narrow">
        <Wipe meta={clips} />
        <figcaption>Drag across the image to compare.</figcaption>
      </figure>

      <div className="ha-col">
        <h2>Three phones</h2>
        <p>One view is flat. Three phones about ~5 ft apart see the same flame from different sides.</p>
        <p>To find where they were, each one filmed a checkerboard pattern on a laptop screen. The dots are the corners it found. The same corners seen from two phones fix where those two phones are relative to each other.</p>
      </div>
      <figure className="ha-fig">
        <Calib />
        <figcaption>The board as each phone saw it</figcaption>
      </figure>
      <figure className="ha-fig">
        <Rig3D />
        <figcaption>Where that puts the phones. Drag to look around.</figcaption>
      </figure>

      {/* <div className="ha-col">
        <p>They started recording at different times. They all heard the same room, so lining up the sound lines up the video.</p>
      </div>
      <figure className="ha-fig ha-fig-narrow">
        <Sync />
        <figcaption>Drag the left and right tracks until they match the center.</figcaption>
      </figure> */}

      <div className="ha-col">
        <h2>Fitting</h2>
        <p>The 3D field starts empty. Over and over, it renders what each phone should have filmed and corrects itself toward what it did film.</p>
      </div>
      <figure className="ha-fig">
        <Training />
        <figcaption>Top: filmed. Bottom: the field's guess at that point in training.</figcaption>
      </figure>

      <div className="ha-col">
        <h2>The field</h2>
      </div>
      <figure className="ha-fig">
        <Field />
        <figcaption>Drag to turn. Shadowgram shows what a phone at that angle would film.</figcaption>
      </figure>
      <div className="ha-col">
        <p className="ha-note">The phones only cover 31°, so a lot of the depth information had to be guessed by the field.</p>
        <p className="ha-note">
          excap · <a href="https://github.com/manorajesh/hotair">code</a>
        </p>
      </div>
    </div>
  );
}

export default HotAir;
