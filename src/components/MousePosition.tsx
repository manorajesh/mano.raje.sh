import React, { useEffect, useState } from "react";

export const MousePositionContext = React.createContext({ x: 0, y: 0 });

export function MousePositionProvider({ children }: any) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        setMousePosition({
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  return (
    <MousePositionContext.Provider value={mousePosition}>
      {children}
    </MousePositionContext.Provider>
  );
}
