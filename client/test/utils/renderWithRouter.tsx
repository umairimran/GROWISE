import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

interface RouterRenderOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
}

export const renderWithRouter = (ui: ReactElement, options: RouterRenderOptions = {}) => {
  const { route = "/", ...renderOptions } = options;

  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>,
    renderOptions,
  );
};
