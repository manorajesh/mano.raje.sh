import React from "react";
import BallPool from "./components/BallPool";
import { TypeAnimation } from "react-type-animation";
import { MousePositionProvider } from "./components/MousePosition";

function App() {
  return (
    <MousePositionProvider>
      <div>
        <BallPool />
        <div className="flex justify-center items-center min-h-screen font-sans bg-dark-blue p-6">
          <div className="text-white max-w-prose">
            <div className="text-left text-5xl pb-6 font-serif italic">
              <h1>hello</h1>
            </div>

            <div>
              <p className="text-lg">
                I'm Mano,{" "}
                <TypeAnimation
                  sequence={[
                    "an engineer and artist.",
                    2000,
                    "an artist and engineer.",
                    2000,
                  ]}
                  wrapper="span"
                  speed={25}
                  repeat={Infinity}
                  deletionSpeed={15}
                  className="text-lg bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] to-slate-500 from-white text-transparent bg-clip-text"
                />
              </p>

              <p className="text-lg pt-3">
                You can find my <a href="https://github.com/manorajesh">code</a>{" "}
                on GitHub and my art <a href="">here</a> (or on{" "}
                <a href="https://www.artstation.com/manorajesh">ArtStation</a>{" "}
                if you prefer). I've also written down some thoughts{" "}
                <a href="">here</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MousePositionProvider>
  );
}

export default App;
