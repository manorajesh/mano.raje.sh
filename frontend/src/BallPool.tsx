import React, { useEffect, useState } from "react";
import Matter from "matter-js";

export default function BallPool() {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  useEffect(() => {
    if (isLoaded) {
      setTimeout(() => setShowLoadingScreen(false), 100); // Adjust delay as needed
    }
  }, [isLoaded]);

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
      Mouse = Matter.Mouse,
      Body = Matter.Body,
      Events = Matter.Events;

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
        background: "transparent",
      },
    });

    // Normalize radius and spacing based on the smaller dimension of window size
    const smallerDimension = Math.min(windowSize.width, windowSize.height);
    const radius = Math.round(smallerDimension / 90);
    const spacing = Math.round(smallerDimension / 50);

    calculatePatternCoordinatesFromImage(
      "mano0.png",
      windowSize.width,
      windowSize.height,
      spacing
    )
      .then((patternCoords) => {
        patternCoords.forEach((coord) => {
          let ball = createBall(coord.x, coord.y, radius, coord.color);
          Composite.add(engine.world, [ball]);
        });
      })
      .catch((error) => {
        console.error("Error calculating pattern coordinates:", error);
      });

    var mouse = Mouse.create(render.canvas);
    var body = Bodies.rectangle(0, 0, 5, 5, {
      isStatic: true,
      render: {
        visible: false,
      },
    });
    Composite.add(engine.world, body);

    Events.on(engine, "afterUpdate", function () {
      if (!mouse.position.x) {
        return;
      }

      Body.setVelocity(body, {
        x: 25,
        y: 25,
      });

      Body.setPosition(body, {
        x: mouse.position.x,
        y: mouse.position.y,
      });
    });

    // run the renderer
    Render.run(render);

    // create runner
    var runner = Runner.create();

    // run the engine
    Runner.run(runner, engine);

    setIsLoaded(true);

    return () => {
      // Cleanup on component unmount
      Render.stop(render);
      Engine.clear(engine);
      Runner.stop(runner);
      render.canvas.remove();
      render.textures = {};
    };
  }, [windowSize]);

  return (
    <div>
      <div
        className={`absolute top-0 left-0 w-full h-full flex justify-center items-center bg-black transition-opacity duration-500 z-20 pointer-events-none ${
          showLoadingScreen ? "opacity-100" : "opacity-0"
        }`}
      ></div>

      <div
        id="simulation-container"
        className="w-full h-full absolute t-0 l-0 z-10"
      ></div>
    </div>
  );
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
      // Calculate the scale factor to fit the image within the specified width
      const scaleFactor = width / image.width;
      const scaledHeight = image.height * scaleFactor;

      // Draw and tile the image vertically
      for (let y = 0; y < canvas.height; y += scaledHeight) {
        ctx?.drawImage(image, 0, y, width, scaledHeight);
      }

      const imageData = ctx?.getImageData(0, 0, width, height);
      let coordinates: PatternCoordinate[] = [];

      for (let y = 0; y < (imageData?.height ?? 0); y += spacing) {
        for (let x = 0; x < (imageData?.width ?? 0); x += spacing) {
          const index = (y * (imageData?.width ?? 0) + x) * 4;
          const alpha = imageData?.data[index + 3] ?? 0;
          if (alpha > 0) {
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
    friction: 0.0,
    frictionAir: 0.0,
  });
}
