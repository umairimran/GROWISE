import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../state/authStore";

export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((snapshot) => snapshot.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }

  return <Outlet />;
};

export const GuestOnlyRoute = () => {
  const isAuthenticated = useAuthStore((snapshot) => snapshot.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
