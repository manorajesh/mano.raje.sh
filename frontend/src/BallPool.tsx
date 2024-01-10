import React, { useEffect, useReducer, useRef, useState } from "react";
import Matter from "matter-js";
import * as PIXI from "pixi.js";
import { Stage, Graphics, useTick } from "@pixi/react";

type BallState = {
  body: Matter.Body;
  color: string;
};

declare module "matter-js" {
  interface Body {
    sprite?: PIXI.Sprite;
  }
}

declare module "pixi.js" {
  interface IApplicationOptions {
    transparent?: boolean;
  }
}

export default function BallPool() {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const appRef = useRef<number | null>(null);

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
      Composite = Matter.Composite,
      Mouse = Matter.Mouse,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Events = Matter.Events;

    var sceneContainer = document.getElementById("simulation-container")!;

    const engine = Matter.Engine.create({ gravity: { y: 0 } });
    engine.timing.timeScale = 0.5;

    const app = new PIXI.Application<HTMLCanvasElement>({
      width: windowSize.width,
      height: windowSize.height,
      antialias: true,
      forceCanvas: false,
      backgroundAlpha: 0,
    });
    const stage = app.stage;
    const particles = new PIXI.ParticleContainer(10000);
    stage.addChild(particles as any);

    sceneContainer.appendChild(app.view);

    // Normalize radius and spacing based on the smaller dimension of window size
    const smallerDimension = Math.min(windowSize.width, windowSize.height);
    const radius = Math.round(smallerDimension / 100);
    const spacing = Math.round(smallerDimension / 50);

    calculatePatternCoordinatesFromImage(
      "mano0.png",
      windowSize.width,
      windowSize.height,
      spacing
    )
      .then((patternCoords) => {
        patternCoords.forEach((coord) => {
          let ball = createBall(coord.x, coord.y, radius);
          Composite.add(engine.world, [ball]);

          const texture = PIXI.Texture.from("circle-sprite.png"); // Use your texture
          const sprite = new PIXI.Sprite(texture);
          sprite.position.set(coord.x, coord.y);
          sprite.tint = PIXI.utils.string2hex(coord.color);
          sprite.scale.set(radius / 45);
          particles.addChild(sprite);

          // Store the sprite in Matter.js body for easy access
          ball.sprite = sprite;
        });
      })
      .catch((error) => {
        console.error(error);
      });

    var mouse = Mouse.create(sceneContainer);
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
    Runner.run(runner, engine);

    app.ticker.add(() => {
      // Update sprite positions to match Matter.js bodies
      Composite.allBodies(engine.world).forEach((body) => {
        if (body.sprite) {
          body.sprite.position.set(body.position.x, body.position.y);
        }
      });
    });

    return () => {
      // Cleanup on component unmount
      Engine.clear(engine);
      Runner.stop(runner);
      cancelAnimationFrame(appRef.current!);
      app.destroy(true);
    };
  }, [windowSize]);

  return (
    <div
      id="simulation-container"
      className="w-full h-full absolute t-0 l-0 z-10"
    />
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

function createBall(x: number, y: number, radius: number) {
  return Matter.Bodies.circle(x, y, radius, {
    restitution: 0.9,
    friction: 0.0,
    frictionAir: 0.0,
  });
}
