import React, { useEffect, useState } from "react";
import Matter from "matter-js";

export default function BallPool() {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // module aliases
    var Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      MouseConstraint = Matter.MouseConstraint,
      Mouse = Matter.Mouse;

    // create an engine
    var engine = Engine.create();
    engine.gravity.y = 0; // Disable gravity

    // Create a renderer
    let render = Matter.Render.create({
      element: document.getElementById("simulation-container") ?? undefined,
      engine: engine,
      options: {
        width: windowSize.width,
        height: windowSize.height,
        wireframes: false,
      },
    });

    calculatePatternCoordinatesFromImage(
      "mano0.png",
      windowSize.width,
      windowSize.height,
      25
    )
      .then((patternCoords) => {
        patternCoords.forEach((coord) => {
          let ball = createBall(coord.x, coord.y, 10, coord.color); // Modify radius and other properties as needed
          Composite.add(engine.world, [ball]);
        });
      })
      .catch((error) => {
        console.error("Error calculating pattern coordinates:", error);
      });

    // add mouse control
    var mouse = Mouse.create(render.canvas),
      mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
          stiffness: 0.1,
          render: {
            visible: false,
          },
        },
      });

    Composite.add(engine.world, mouseConstraint);

    // create a ground
    // let ground = Bodies.rectangle(
    //   windowSize.width / 2,
    //   windowSize.height,
    //   windowSize.width,
    //   60,
    //   {
    //     isStatic: true,
    //     render: {
    //       fillStyle: "#ffffff",
    //     },
    //   }
    // );
    // Composite.add(engine.world, [ground]);

    // run the renderer
    Render.run(render);

    // create runner
    var runner = Runner.create();

    // run the engine
    Runner.run(runner, engine);

    return () => {
      // Cleanup on component unmount
      Render.stop(render);
      Engine.clear(engine);
      render.canvas.remove();
      render.textures = {};
    };
  }, [windowSize]);

  return <div id="simulation-container" className="w-full h-full"></div>;
}

type PatternCoordinate = {
  x: number;
  y: number;
  color: string; // RGB color
};

function calculatePatternCoordinatesFromImage(
  imageUrl: string,
  width: number,
  height: number,
  spacing: number
): Promise<PatternCoordinate[]> {
  return new Promise<PatternCoordinate[]>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image = new Image();
    image.src = imageUrl;

    image.onload = () => {
      ctx?.drawImage(image, 0, 0, width, height);
      const imageData = ctx?.getImageData(0, 0, width, height);
      let coordinates: PatternCoordinate[] = [];

      for (let y = 0; y < (imageData?.height ?? 0); y += spacing) {
        for (let x = 0; x < (imageData?.width ?? 0); x += spacing) {
          const index = (y * (imageData?.width ?? 0) + x) * 4;
          const alpha = imageData?.data[index + 3];
          if (alpha ?? 0 > 0) {
            // Get the color of the pixel
            const color = `rgb(${imageData?.data[index]}, ${
              imageData?.data[index + 1]
            }, ${imageData?.data[index + 2]})`;
            coordinates.push({ x, y, color });
          }
        }
      }

      resolve(coordinates);
    };

    image.onerror = reject;
  });
}

function createBall(x: number, y: number, radius: number, color: string) {
  return Matter.Bodies.circle(x, y, radius, {
    restitution: 0.9,
    render: {
      fillStyle: color,
    },
  });
}
