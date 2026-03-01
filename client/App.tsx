import { FC, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Header } from "./components/Header";
import { Layout } from "./components/Layout";
import { Toast } from "./components/Toast";
import { ThemeProvider } from "./providers/ThemeProvider";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Blog } from "./pages/Blog";
import { SkillSelection } from "./pages/SkillSelection";
import { Assessment } from "./pages/Assessment";
import { Dashboard } from "./pages/Dashboard";
import { Validator } from "./pages/Validator";
import { generateCurriculum } from "./services/geminiService";
import { authService } from "./api/services/auth";
import { GuestOnlyRoute, ProtectedRoute } from "./routes/guards";
import { authStore, useAuthStore } from "./state/authStore";
import { AssessmentResult, User } from "./types";
import type { components } from "./api/generated/openapi";

const mapApiUserToAppUser = (
  user: components["schemas"]["UserDetailedResponse"] | null
): User | null => {
  if (!user) {
    return null;
  }

  return {
    id: String(user.user_id),
    name: user.full_name,
    email: user.email,
    isPro: false,
  };
};

interface LearnerLayoutRouteProps {
  isSidebarOpen: boolean;
  onSidebarClose: () => void;
}

const LearnerLayoutRoute: FC<LearnerLayoutRouteProps> = ({ isSidebarOpen, onSidebarClose }) => (
  <Layout isSidebarOpen={isSidebarOpen} onSidebarClose={onSidebarClose}>
    <Outlet />
  </Layout>
);

interface RoutedAppContentProps {
  user: User | null;
  isAuthenticated: boolean;
  assessmentResult: AssessmentResult | null;
  isGeneratingCourse: boolean;
  toastMessage: string | null;
  onCloseToast: () => void;
  onGenerateCourse: () => Promise<void>;
  onAssessmentComplete: (result: AssessmentResult) => void;
  onLogout: () => Promise<void>;
  onLoginSuccess: (user: User) => void;
  onSignupSuccess: (user: User) => void;
}

const RoutedAppContent: FC<RoutedAppContentProps> = ({
  user,
  isAuthenticated,
  assessmentResult,
  isGeneratingCourse,
  toastMessage,
  onCloseToast,
  onGenerateCourse,
  onAssessmentComplete,
  onLogout,
  onLoginSuccess,
  onSignupSuccess,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, location.search]);

  const handleLogoutAndGoHome = async () => {
    await onLogout();
    navigate("/", { replace: true });
  };

  return (
    <div className="antialiased text-gray-900 dark:text-gray-100 bg-background min-h-screen font-sans">
      {toastMessage && <Toast message={toastMessage} onClose={onCloseToast} />}

      <Header
        user={user}
        onLogout={handleLogoutAndGoHome}
        onMenuToggle={() => setIsSidebarOpen((currentState) => !currentState)}
      />

      <Routes>
        <Route
          path="/"
          element={
            <Home
              onStart={() => navigate(isAuthenticated ? "/skills" : "/signup")}
              onLoginClick={() => navigate("/login")}
              user={user}
              onDashboardClick={() => navigate("/dashboard")}
              onBlogClick={() => navigate("/blog")}
              onDemoClick={() => navigate("/skills")}
            />
          }
        />
        <Route path="/blog" element={<Blog onBack={() => navigate("/")} />} />

        <Route element={<GuestOnlyRoute />}>
          <Route
            path="/login"
            element={
              <Login
                onLogin={(loggedInUser) => {
                  onLoginSuccess(loggedInUser);
                  navigate("/dashboard", { replace: true });
                }}
                onBack={() => navigate("/")}
                onGoToSignup={() => navigate("/signup")}
              />
            }
          />
          <Route
            path="/signup"
            element={
              <Signup
                onSignupSuccess={(newUser) => {
                  onSignupSuccess(newUser);
                  navigate("/dashboard", { replace: true });
                }}
                onBack={() => navigate("/")}
                onGoToLogin={() => navigate("/login")}
              />
            }
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route
            path="/skills"
            element={
              <SkillSelection
                onSelect={({ sessionId }) => navigate(`/assessment/${sessionId}`)}
                onBack={() => navigate("/")}
              />
            }
          />
          <Route
            path="/assessment/:sessionId"
            element={
              <Assessment
                onComplete={(result) => {
                  onAssessmentComplete(result);
                  navigate("/dashboard");
                }}
                onExit={() => navigate("/skills")}
              />
            }
          />
          <Route
            element={
              <LearnerLayoutRoute
                isSidebarOpen={isSidebarOpen}
                onSidebarClose={() => setIsSidebarOpen(false)}
              />
            }
          >
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  user={user}
                  result={assessmentResult}
                  onGenerateCourse={onGenerateCourse}
                  isGenerating={isGeneratingCourse}
                  onStartAssessment={() => navigate("/skills")}
                />
              }
            />
            <Route path="/validator" element={<Validator />} />
          </Route>
          <Route path="/course" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />}
        />
      </Routes>
    </div>
  );
};

const App: FC = () => {
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [isGeneratingCourse, setIsGeneratingCourse] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const authState = useAuthStore((snapshot) => snapshot);
  const user = useMemo(() => mapApiUserToAppUser(authState.currentUser), [authState.currentUser]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const { accessToken, refreshToken } = authStore.getState().session;
      if (!accessToken && !refreshToken) {
        authStore.setBootstrapping(false);
        return;
      }

      authStore.setBootstrapping(true);
      try {
        await authService.me();
      } catch {
        authStore.clearSession();
      } finally {
        if (isMounted) {
          authStore.setBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      authStore.clearSession();
    } finally {
      setAssessmentResult(null);
    }
  };

  const handleAssessmentComplete = (result: AssessmentResult): void => {
    setAssessmentResult(result);
    if (result.learningPathId) {
      setToastMessage(`Assessment complete. Learning path #${result.learningPathId} is ready.`);
      return;
    }

    setToastMessage("Assessment complete. Learning path generation is in progress.");
  };

  const handleGenerateCourse = async (): Promise<void> => {
    if (!assessmentResult) {
      return;
    }

    setIsGeneratingCourse(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await generateCurriculum(assessmentResult.topic, assessmentResult.weaknesses);
      setToastMessage("Course generated successfully! (Curriculum page is currently disabled)");
    } catch (error) {
      alert("Failed to generate course");
      console.error(error);
    } finally {
      setIsGeneratingCourse(false);
    }
  };

  const handleLoginSuccess = (loggedInUser: User): void => {
    setToastMessage(`Welcome back, ${loggedInUser.name}`);
  };

  const handleSignupSuccess = (newUser: User): void => {
    setToastMessage(`Account ready, ${newUser.name}`);
  };

  if (authState.isBootstrapping) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="grow-wise-theme">
        <div className="min-h-screen flex items-center justify-center bg-background text-contrast font-sans">
          Restoring session...
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="grow-wise-theme">
      <BrowserRouter>
        <RoutedAppContent
          user={user}
          isAuthenticated={authState.isAuthenticated}
          assessmentResult={assessmentResult}
          isGeneratingCourse={isGeneratingCourse}
          toastMessage={toastMessage}
          onCloseToast={() => setToastMessage(null)}
          onGenerateCourse={handleGenerateCourse}
          onAssessmentComplete={handleAssessmentComplete}
          onLogout={handleLogout}
          onLoginSuccess={handleLoginSuccess}
          onSignupSuccess={handleSignupSuccess}
        />
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
