import React from "react";
import BallPool from "../components/BallPool";
import { TypeAnimation } from "react-type-animation";
import { MousePositionProvider } from "../components/MousePosition";
import { Link } from "react-router-dom";

const pages = [
  { path: "/leaf-typology", name: "leaf typology" },
  { path: "/city-steps", name: "pgh city steps" },
  { path: "/arabic", name: "ḥurūf" },
  { path: "/hindi", name: "hindi" },
  { path: "/numerals", name: "numerals" },
  { path: "/mixie", name: "mixie" },
  { path: "/wordle", name: "wordle to image" },
  { path: "/peculiar-code", name: "peculiar code" },
  { path: "/letterboxd", name: "letterboxd" },
  { path: "/pinterest", name: "pinterest" },
];

function Home() {
  return (
    <MousePositionProvider>
      <div>
        <BallPool />
        <div className="bg-dark-blue flex min-h-screen items-center justify-center p-6 font-sans">
          <div className="max-w-prose text-white">
            <div className="pb-6 text-left font-serif text-5xl italic">
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
                  className="bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] from-white to-slate-500 bg-clip-text text-lg text-transparent"
                />
              </p>

              <p className="pt-3 text-lg">
                You can find my <a href="https://github.com/manorajesh">code</a>{" "}
                on GitHub and my art on{" "}
                <a href="https://www.artstation.com/manorajesh">ArtStation</a> and{" "}
                <Link to="/portfolio">here</Link>. I'll write down some thoughts <a href="/">here</a> in
                a bit.
              </p>
            </div>

            <nav className="pt-10">
              <h2 className="pb-2 font-serif text-xl">around here</h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-lg">
                {pages.map(({ path, name }) => (
                  <li key={path}>
                    <Link to={path}>{name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </MousePositionProvider>
  );
}

export default Home;
