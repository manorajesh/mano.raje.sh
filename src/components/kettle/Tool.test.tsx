import { fireEvent, render, screen } from "@testing-library/react";
import KettleTool from "./Tool";

jest.mock("./scene", () => ({
  KettleScene: class {
    tags = {};
    update() {} dispose() {} setView() {} setSpeed() {} setFocus() {} setDimState() {}
    stopPour() {} resetWater() {}
  },
}));

test("design shortcuts and buttons share history while text fields keep native undo", () => {
  render(<KettleTool />);
  const field = screen.getByRole("textbox", { name: "Cup distance" });
  const slider = screen.getByRole("slider", { name: "Cup distance" }) as HTMLInputElement;
  const initial = slider.value;
  const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
  expect(undo.disabled).toBe(true);
  fireEvent.change(slider, { target: { value: "13" } });
  fireEvent.keyDown(field, { key: "z", metaKey: true });
  expect(slider.value).toBe("13");
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(slider.value).toBe(initial);
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(slider.value).toBe("13");
  fireEvent.keyDown(window, { key: "R", shiftKey: true });
  expect(slider.value).toBe(initial);
  fireEvent.click(undo);
  expect(slider.value).toBe("13");
  fireEvent.keyDown(window, { key: "Z", metaKey: true, shiftKey: true });
  expect(slider.value).toBe(initial);
});
