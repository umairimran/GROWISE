import { FC, FormEvent, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../components/Button";
import { authService } from "../api/services/auth";
import { ApiHttpError } from "../api/http";
import { User } from "../types";
import type { components } from "../api/generated/openapi";
import { AuthShell } from "../components/auth-layout";
import { Panel, StatusPill } from "../components/ui";

interface SignupProps {
  onSignupSuccess: (user: User) => void;
  onBack: () => void;
  onGoToLogin: () => void;
}

const mapApiUserToAppUser = (user: components["schemas"]["UserDetailedResponse"]): User => ({
  id: String(user.user_id),
  name: user.full_name,
  email: user.email,
  isPro: false,
});

export const Signup: FC<SignupProps> = ({ onSignupSuccess, onBack, onGoToLogin }) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!agreedToTerms) {
      setErrorMsg("You must agree to the Terms and Conditions to continue.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await authService.register({
        email,
        full_name: fullName,
        password,
      });

      try {
        await authService.loginJson({ email, password });
        const me = await authService.me();
        onSignupSuccess(mapApiUserToAppUser(me));
        return;
      } catch {
        setSuccessMsg("Account created successfully. Please proceed to log in.");
      }
    } catch (error) {
      if (error instanceof ApiHttpError) {
        if (error.status === 422) {
          setErrorMsg(error.message || "Please check your details. Password must be at least 8 characters.");
        } else {
          setErrorMsg(error.message || "Failed to sign up.");
        }
      } else if (error instanceof Error) {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("Failed to sign up.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = () => {
    setErrorMsg("Google Sign-Up is not available in API mode yet.");
  };

  if (successMsg) {
    return (
      <AuthShell
        title={<>Account created.</>}
        description={<>Your profile is ready. Continue to sign in and start your first assessment.</>}
        sideTitle="Account ready"
        sideDescription="The signup step now ends in a clean confirmation state instead of a giant standalone card."
        onBack={onBack}
        footnote={
          <button onClick={onGoToLogin} className="text-sm font-semibold text-primary hover:underline">
            Proceed to login
          </button>
        }
      >
        <Panel className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-display text-3xl font-semibold text-contrast">Account created</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {successMsg} <span className="font-semibold text-contrast">{email}</span>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={onGoToLogin} size="lg">
              Proceed to login
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Panel>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={<>Join Grow Wise.</>}
      description={
        <>
          Create an account to get a personalized assessment, learning path, and evaluation flow.
        </>
      }
      sideTitle="Create your account"
      sideDescription="Start your first assessment in minutes. No credit card required."
      sidePoints={[
        "Start with an assessment instead of a generic onboarding maze.",
        "Terms acceptance and password constraints are visible and direct.",
        "Success messaging gives you a clean transition into login.",
      ]}
      onBack={onBack}
      footnote={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral">
            <ShieldCheck className="h-3.5 w-3.5" />
            Protected signup
          </StatusPill>
          <span>Already have an account?</span>
          <button onClick={onGoToLogin} className="font-semibold text-primary hover:underline">
            Log in
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMsg && (
          <div className="status-banner" data-tone="error">
            <AlertCircle className="mt-0.5 h-4 w-4 text-danger" />
            <p className="text-sm leading-6 text-contrast">{errorMsg}</p>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="fullname">
            Full name
          </label>
          <div className="field-shell has-icon">
            <UserIcon className="h-4 w-4" />
            <input
              type="text"
              id="fullname"
              required
              className="field-input"
              placeholder="John Doe"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="email">
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
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <div className="field-shell has-icon">
            <Lock className="h-4 w-4" />
            <input
              type="password"
              id="password"
              required
              minLength={8}
              className="field-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Passwords must be at least 8 characters. Use a strong, unique password.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface/90 p-4">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            required
            checked={agreedToTerms}
            onChange={(event) => setAgreedToTerms(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="terms" className="text-sm leading-6 text-muted-foreground">
            I agree to the{" "}
            <a href="#" className="font-semibold text-primary hover:underline">
              Terms and Conditions
            </a>{" "}
            and{" "}
            <a href="#" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </label>
        </div>

        <Button type="submit" isLoading={isLoading} disabled={!agreedToTerms} className="w-full" size="lg">
          Create account
        </Button>
      </form>

    </AuthShell>
  );
};
