import React, { useEffect, useState } from "react";
import Matter from "matter-js";
import * as PIXI from "pixi.js";
import { Stage, Graphics, useTick } from "@pixi/react";

interface BallProps {
  ballState: BallState;
}

type BallState = {
  body: Matter.Body;
  color: string;
  radius: number;
};

const Ball = ({ ballState }: BallProps) => {
  const [position, setPosition] = useState({
    x: ballState.body.position.x,
    y: ballState.body.position.y,
  });

  useTick(() => {
    setPosition({ x: ballState.body.position.x, y: ballState.body.position.y });
  });

  return (
    <Graphics
      draw={(g) => {
        g.clear();
        g.beginFill(PIXI.utils.string2hex(ballState.color));
        g.drawCircle(position.x, position.y, ballState.radius);
        g.endFill();
      }}
    />
  );
};

export default function BallPool() {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [balls, setBalls] = useState<BallState[]>([]);

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
    var Engine = Matter.Engine,
      Runner = Matter.Runner,
      Mouse = Matter.Mouse,
      Composite = Matter.Composite,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Events = Matter.Events;

    const engine = Engine.create();
    engine.gravity.y = 0; // Disable gravity

    // Normalize radius and spacing based on the smaller dimension of window size
    const smallerDimension = Math.min(windowSize.width, windowSize.height);
    const radius = Math.round(smallerDimension / 90);
    const spacing = Math.round(smallerDimension / 50);

    const initialBalls: BallState[] = [];

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

          initialBalls.push({
            body: ball,
            color: coord.color,
            radius: radius,
          });
        });

        setBalls(initialBalls);
      })
      .catch((error) => {
        console.error(error);
      });

    var mouse = Mouse.create(document.getElementById("simulation-container")!);
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

    // create runner
    var runner = Runner.create();

    // run the engine
    Runner.run(runner, engine);

    return () => {
      // Cleanup on component unmount
      Engine.clear(engine);
      Runner.stop(runner);
    };
  }, [windowSize]);

  return (
    <div
      id="simulation-container"
      className="w-full h-full absolute t-0 l-0 z-10"
    >
      <Stage width={window.innerWidth} height={window.innerHeight}>
        {balls.map((ball, index) => (
          <Ball key={index} ballState={ball} />
        ))}
      </Stage>
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
    friction: 0.0,
    frictionAir: 0.0,
  });
}
