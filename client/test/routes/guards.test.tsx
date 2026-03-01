// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute } from "../../routes/guards";
import { authStore } from "../../state/authStore";

const LocationProbe = () => {
  const location = useLocation();
  const state = location.state as { returnTo?: string } | null;

  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="return-to">{state?.returnTo ?? ""}</span>
    </div>
  );
};

describe("route guards", () => {
  beforeEach(() => {
    cleanup();
    authStore.clearSession();
  });

  it("redirects unauthenticated users from protected routes and preserves returnTo", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard?tab=overview"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>private dashboard</div>} />
          </Route>
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("private dashboard")).toBeNull();
    expect(screen.getByTestId("pathname").textContent).toBe("/login");
    expect(screen.getByTestId("return-to").textContent).toBe("/dashboard?tab=overview");
  });

  it("allows authenticated users into protected routes", () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "session-1",
      tokenType: "bearer",
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>private dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("private dashboard")).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();
  });

  it("redirects authenticated users away from guest-only routes", () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "session-1",
      tokenType: "bearer",
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route element={<GuestOnlyRoute />}>
            <Route path="/login" element={<div>login page</div>} />
          </Route>
          <Route path="/dashboard" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    return waitFor(() => {
      expect(screen.queryByText("login page")).toBeNull();
      expect(screen.getByTestId("pathname").textContent).toBe("/dashboard");
    });
  });
});
