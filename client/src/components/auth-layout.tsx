import { FC, ReactNode } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole, Sparkles, ShieldCheck, Users } from "lucide-react";
import { Panel, StatusPill } from "./ui";

interface AuthShellProps {
  title: ReactNode;
  description: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  sideTitle?: ReactNode;
  sideDescription?: ReactNode;
  sidePoints?: string[];
  action?: ReactNode;
  onBack?: () => void;
}

export const AuthShell: FC<AuthShellProps> = ({
  title,
  description,
  footnote,
  children,
  sideTitle = "Welcome to Grow Wise",
  sideDescription = "Your assessments, learning paths, and progress — all in one place.",
  sidePoints = [
    "Pick up exactly where you left off",
    "Your progress is saved automatically",
    "Works on any device",
  ],
  action,
  onBack,
}) => (
  <div className="auth-shell">
    <div className="mesh-backdrop" />
    <div className="noise-overlay" />

    <div className="auth-grid">
      <Panel className="auth-feature">
        <div className="space-y-5">
          <StatusPill tone="accent">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome
          </StatusPill>
          <div className="space-y-4">
            <h1 className="section-title max-w-2xl">{title}</h1>
            <p className="section-copy max-w-xl">{description}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rail-card">
            <div className="metric-label">HOW IT WORKS</div>
            <div className="mt-2 text-lg font-semibold text-contrast">Adaptive learning</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Assessments adapt to your level. Learning paths are generated from your real gaps.
            </p>
          </div>
          <div className="rail-card">
            <div className="metric-label">YOUR DATA</div>
            <div className="mt-2 text-lg font-semibold text-contrast">Clear recovery</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Password reset is straightforward. Your progress is always saved.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="section-divider" />
          <div className="grid gap-3">
            {sidePoints.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                <p className="text-sm leading-6 text-muted-foreground">{point}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone="neutral">
            <LockKeyhole className="h-3.5 w-3.5" />
            Secure login
          </StatusPill>
          <StatusPill tone="neutral">
            <ShieldCheck className="h-3.5 w-3.5" />
            Progress saved
          </StatusPill>
          <StatusPill tone="neutral">
            <Users className="h-3.5 w-3.5" />
            Free to start
          </StatusPill>
        </div>
      </Panel>

      <div className="auth-panel">
        <div className="mb-6 flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-contrast"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
          {action}
        </div>
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-contrast">
              {sideTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{sideDescription}</p>
          </div>
          {children}
          {footnote ? <div className="pt-1 text-sm text-muted-foreground">{footnote}</div> : null}
        </div>
      </div>
    </div>
  </div>
);
