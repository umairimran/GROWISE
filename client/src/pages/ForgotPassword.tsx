import { FC, FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export const ForgotPassword: FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
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
      setSuccessMessage(
        "If an account exists for this email, a reset link has been sent."
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to request password reset."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-background font-sans overflow-hidden">
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
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-cyan-900/30 rounded-full mix-blend-screen filter blur-[80px] animate-blob delay-4000" />
      </div>

      <div className="w-full max-w-md bg-surface/80 dark:bg-black/45 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-8 sm:p-10 relative z-10 animate-fade-in-up">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center text-gray-500 dark:text-gray-400 hover:text-contrast transition-colors text-sm font-medium mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to login
        </button>

        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-contrast tracking-tight mb-2">
            Reset your password
          </h1>
          <p className="text-gray-400 text-sm">
            Enter your email to request a password reset token.
          </p>
        </div>

        {errorMessage && (
          <p className="mb-4 rounded-lg border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-900/25 px-3 py-2 text-sm text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{successMessage}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium text-contrast/90 mb-1.5">
              Email address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-surface text-contrast placeholder-gray-500 transition-all outline-none"
              />
            </div>
          </div>

          <Button type="submit" isLoading={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 border-none">
            Send reset instructions
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/reset-password")}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium hover:underline"
          >
            Already have a reset token?
          </button>
        </div>
      </div>
    </div>
  );
};
