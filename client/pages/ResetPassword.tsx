import { FC, FormEvent, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Beams from "../components/Beams";
import { Button } from "../components/Button";
import { ApiHttpError } from "../api/http";
import { authService } from "../api/services/auth";
import { useTheme } from "../providers/ThemeProvider";

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
  const { theme } = useTheme();
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
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-[#0A0A0A] font-sans overflow-hidden">
      {theme === "dark" && (
        <div className="absolute inset-0 z-0">
          <Beams
            beamWidth={2}
            beamHeight={15}
            beamNumber={12}
            lightColor="#ffffff"
            speed={2}
            noiseIntensity={1.75}
            scale={0.2}
            rotation={0}
          />
        </div>
      )}

      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-2000" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-teal-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-4000" />
      </div>

      <div className="w-full max-w-md bg-black/45 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl p-8 sm:p-10 relative z-10 animate-fade-in-up">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center text-gray-400 hover:text-white transition-colors text-sm font-medium mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to login
        </button>

        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-white tracking-tight mb-2">
            Confirm password reset
          </h1>
          <p className="text-gray-400 text-sm">
            Paste your reset token and choose a secure new password.
          </p>
        </div>

        {errorMessage && (
          <p className="mb-4 rounded-lg border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-900/25 px-3 py-2 text-sm text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-token" className="block text-sm font-medium text-gray-200 mb-1.5">
              Reset token
            </label>
            <textarea
              id="reset-token"
              required
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              className="block w-full min-h-[96px] px-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
              placeholder="Paste reset token"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-200 mb-1.5">
              New password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="new-password"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-new-password"
              className="block text-sm font-medium text-gray-200 mb-1.5"
            >
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="block w-full px-3 py-2.5 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-neutral-800 text-white placeholder-gray-500 transition-all outline-none"
            />
          </div>

          <Button type="submit" isLoading={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 border-none">
            Reset password
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/forgot-password")}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium hover:underline"
          >
            Request a new token
          </button>
        </div>
      </div>
    </div>
  );
};
