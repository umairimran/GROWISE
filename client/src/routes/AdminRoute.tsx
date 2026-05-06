import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../state/authStore";

export const AdminRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  }

  if (currentUser && currentUser.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
