import { FC, FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ApiHttpError } from "../api/http";
import { authService } from "../api/services/auth";
import { AuthShell } from "../components/auth-layout";
import { StatusPill } from "../components/ui";

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const ForgotPassword: FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authService.requestPasswordReset({ email });
      setSuccessMessage("If an account exists for this email, a reset link has been sent.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to request password reset."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title={<>Reset access.</>}
      description={<>Request a password reset link without leaving the product's visual system.</>}
      sideTitle="Reset your password"
      sideDescription="Enter your email and we'll send you a reset link."
      onBack={() => navigate("/login")}
      footnote={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure reset
          </StatusPill>
          <button onClick={() => navigate("/reset-password")} className="font-semibold text-primary hover:underline">
            I already have a token
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage && (
          <div className="status-banner" data-tone="error">
            <div className="mt-0.5 rounded-full p-1.5 bg-danger/10 text-danger">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-sm leading-6 text-contrast">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="status-banner" data-tone="success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
            <p className="text-sm leading-6 text-contrast">{successMessage}</p>
          </div>
        )}

        <div>
          <label htmlFor="reset-email" className="field-label">
            Email address
          </label>
          <div className="field-shell has-icon">
            <Mail className="h-4 w-4" />
            <input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="field-input"
            />
          </div>
        </div>

        <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
          Send reset instructions
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

    </AuthShell>
  );
};
