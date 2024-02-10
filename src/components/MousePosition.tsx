import React, { useEffect, useState } from "react";

export const MousePositionContext = React.createContext({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
});

export function MousePositionProvider({ children }: any) {
  const [mousePosition, setMousePosition] = useState({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  });
  const [lastPosition, setLastPosition] = useState({
    x: 0,
    y: 0,
    time: Date.now(),
  });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const currentTime = Date.now();
      const timeElapsed = currentTime - lastPosition.time;

      // Calculate velocity
      const vx = (event.clientX - lastPosition.x) / timeElapsed;
      const vy = (event.clientY - lastPosition.y) / timeElapsed;

      setMousePosition({ x: event.clientX, y: event.clientY, vx, vy });
      setLastPosition({
        x: event.clientX,
        y: event.clientY,
        time: currentTime,
      });
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        const currentTime = Date.now();
        const timeElapsed = currentTime - lastPosition.time;
        const vx = (event.touches[0].clientX - lastPosition.x) / timeElapsed;
        const vy = (event.touches[0].clientY - lastPosition.y) / timeElapsed;

        setMousePosition({
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          vx,
          vy,
        });
        setLastPosition({
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          time: currentTime,
        });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [lastPosition]);

  return (
    <MousePositionContext.Provider value={mousePosition}>
      {children}
    </MousePositionContext.Provider>
  );
}
