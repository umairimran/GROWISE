// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Header } from "../../src/components/Header";
import { Layout } from "../../src/components/Layout";

vi.mock("../../src/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">theme</div>,
}));

describe("navigation consistency", () => {
  beforeEach(() => {
    cleanup();
  });

  it("keeps landing navigation actions available on the public home route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={<Header user={null} onLogout={() => undefined} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Testimonials").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pricing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blog").length).toBeGreaterThan(0);
    expect(screen.getByText("Get Started")).toBeTruthy();
  });

  it("hides public marketing links on authenticated dashboard routes", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <Header
                user={{ id: "1", name: "Learner", email: "learner@growwise.test", isPro: false }}
                onLogout={() => undefined}
                onMenuToggle={() => undefined}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Testimonials")).toBeNull();
    expect(screen.queryByText("Pricing")).toBeNull();
    expect(screen.queryByText("Blog")).toBeNull();
  });

  it("keeps learner sidebar navigation labels consistent across routes", () => {
    render(
      <MemoryRouter initialEntries={["/course"]}>
        <Routes>
          <Route
            path="/course"
            element={
              <Layout>
                <div>course content</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Learning Path")).toBeTruthy();
    expect(screen.getByText("Real-World Validator")).toBeTruthy();
    expect(screen.getByText("Account & Security")).toBeTruthy();
  });
});
