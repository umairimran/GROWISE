import { FC, FormEvent, useState } from "react";
import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "../components/Button";
import { authService } from "../api/services/auth";
import { ApiHttpError } from "../api/http";
import { User } from "../types";
import type { components } from "../api/generated/openapi";
import { AuthShell } from "../components/auth-layout";
import { StatusPill } from "../components/ui";

interface LoginProps {
  onLogin: (user: User) => void;
  onBack: () => void;
  onGoToSignup: () => void;
  onGoToForgotPassword: () => void;
}

const mapApiUserToAppUser = (user: components["schemas"]["UserDetailedResponse"]): User => ({
  id: String(user.user_id),
  name: user.full_name,
  email: user.email,
  isPro: false,
});

export const Login: FC<LoginProps> = ({ onLogin, onBack, onGoToSignup, onGoToForgotPassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms);
      }),
    ]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      await withTimeout(authService.loginJson({ email, password }), 15000);
      const me = await withTimeout(authService.me(), 15000);
      onLogin(mapApiUserToAppUser(me));
    } catch (error) {
      if (error instanceof ApiHttpError) {
        if (error.status === 401) {
          setErrorMsg("Invalid credentials. Check your email and password.");
        } else if (error.status === 422) {
          setErrorMsg(error.message || "Enter a valid email and password.");
        } else {
          setErrorMsg(error.message || "Login failed.");
        }
      } else if (error instanceof Error) {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("Login failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setErrorMsg("Google Sign-In is not available in API mode yet.");
  };

  return (
    <AuthShell
      title={<>Continue where you left off.</>}
      description={
        <>Open your dashboard, learning path, and latest evaluator feedback from one login surface.</>
      }
      sideTitle="Welcome back"
      sideDescription="Your assessments and learning progress are waiting."
      sidePoints={[
        "Pick up exactly where the last assessment or learning stage paused.",
        "Keep progress history and report context in one coherent shell.",
        "Use the same auth family across login, reset, and signup without visual drift.",
      ]}
      onBack={onBack}
      footer={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusPill tone="neutral">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure access
          </StatusPill>
          <div>
            Forgot your password?{" "}
            <button onClick={onGoToForgotPassword} className="font-semibold text-primary hover:underline">
              Reset it
            </button>
          </div>
          <div>
            Don&apos;t have an account?{" "}
            <button onClick={onGoToSignup} className="font-semibold text-primary hover:underline">
              Create one
            </button>
          </div>
        </div>
      }
    >
      <>
        {errorMsg ? (
          <div className="status-banner mb-5" data-tone="error">
            <div className="mt-0.5 rounded-full bg-danger/10 p-1.5 text-danger">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="text-sm leading-6 text-muted-foreground">{errorMsg}</div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="field-label">
              Email address
            </label>
            <div className="field-shell has-icon">
              <Mail className="h-4 w-4" />
              <input
                type="email"
                id="email"
                required
                className="field-input"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="field-label !mb-0" htmlFor="password">
                Password
              </label>
              <button
                type="button"
                onClick={onGoToForgotPassword}
                className="text-xs font-semibold uppercase tracking-[0.16em] text-primary hover:underline"
              >
                Forgot?
              </button>
            </div>
            <div className="field-shell has-icon">
              <Lock className="h-4 w-4" />
              <input
                type="password"
                id="password"
                required
                className="field-input"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Password must be at least 8 characters.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Button type="submit" isLoading={isLoading} className="w-full">
              Log in
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleLogin}
              className="w-full sm:w-auto"
            >
              Google
            </Button>
          </div>
        </form>

      </>
    </AuthShell>
  );
};
