import { FC, FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { ApiHttpError } from "../api/http";
import { authService } from "../api/services/auth";
import { AuthShell } from "../components/auth-layout";
import { Panel, StatusPill } from "../components/ui";

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const ResetPassword: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [resetToken, setResetToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!resetToken.trim()) {
      setErrorMessage("Reset token is required.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setErrorMessage("Please enter and confirm your new password.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setIsLoading(true);

    try {
      await authService.confirmPasswordReset({
        reset_token: resetToken.trim(),
        new_password: newPassword,
      });

      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage("Password reset complete. You can now sign in with the new password.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to reset password."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title={<>Set your new password.</>}
      description={<>Finish the recovery flow with a secure new password.</>}
      sideTitle="Set your new password"
      sideDescription="Enter the token from your email and choose a new password."
      onBack={() => navigate("/login")}
      footnote={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral">
            <ShieldCheck className="h-3.5 w-3.5" />
            Token required
          </StatusPill>
          <button onClick={() => navigate("/forgot-password")} className="font-semibold text-primary hover:underline">
            Request a new token
          </button>
        </div>
      }
    >
      {successMessage ? (
        <Panel className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-display text-3xl font-semibold text-contrast">
            Password reset complete
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{successMessage}</p>
          <div className="mt-6">
            <Button onClick={() => navigate("/login")} size="lg">
              Go to login
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Panel>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMessage && (
            <div className="status-banner" data-tone="error">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-danger" />
              <p className="text-sm leading-6 text-contrast">{errorMessage}</p>
            </div>
          )}

          <div>
            <label htmlFor="reset-token" className="field-label">
              Reset token
            </label>
            <textarea
              id="reset-token"
              required
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              className="field-textarea"
              placeholder="Paste reset token"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="field-label">
              New password
            </label>
            <div className="field-shell has-icon">
              <KeyRound className="h-4 w-4" />
              <input
                id="new-password"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="field-input"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="field-label">
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="field-input"
              placeholder="Repeat the new password"
            />
          </div>

          <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
            Reset password
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
