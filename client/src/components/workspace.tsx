import { FC, HTMLAttributes, ReactNode } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "./Button";
import { cn, EmptyState, InlineNotice, Panel, SectionHeading, StatusPill } from "./ui";

export { EmptyState, InlineNotice, Panel, SectionHeading, StatusPill };

export const WorkspaceBackdrop: FC<{ className?: string }> = ({ className }) => (
  <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
    <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
    <div className="absolute right-0 top-24 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
    <div className="noise-overlay opacity-70" />
  </div>
);

interface WorkspaceFrameProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  label?: ReactNode;
}

export const WorkspaceFrame: FC<WorkspaceFrameProps> = ({
  title,
  description,
  actions,
  label,
  className,
  children,
  ...props
}) => (
  <div className={cn("relative", className)} {...props}>
    <WorkspaceBackdrop />
    <div className="relative z-10 page-grid">
      {title || description || actions || label ? (
        <SectionHeading label={label} title={title ?? ""} description={description} actions={actions} />
      ) : null}
      {children}
    </div>
  </div>
);

interface MetricTileProps {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
}

export const MetricTile: FC<MetricTileProps> = ({ label, value, caption }) => (
  <div className="metric-strip">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    {caption ? <div className="metric-caption">{caption}</div> : null}
  </div>
);

interface ProgressRailProps {
  label: string;
  value: number;
  suffix?: string;
  tone?: "accent" | "success" | "warning";
}

export const ProgressRail: FC<ProgressRailProps> = ({ label, value, suffix = "%", tone = "accent" }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <span>{label}</span>
      <span>{Math.round(value)}{suffix}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-contrast/8">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "accent" && "bg-primary",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);

interface SectionActionLinkProps {
  children: ReactNode;
  onClick: () => void;
}

export const SectionActionLink: FC<SectionActionLinkProps> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary"
  >
    {children}
    <ArrowRight className="h-4 w-4" />
  </button>
);

interface CalloutProps {
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger";
}

export const Callout: FC<CalloutProps> = ({ title, body, action, icon, tone = "accent" }) => (
  <Panel className="p-5 sm:p-6" muted>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              tone === "accent" && "bg-primary/10 text-primary",
              tone === "success" && "bg-success/10 text-success",
              tone === "warning" && "bg-warning/10 text-warning",
              tone === "danger" && "bg-danger/10 text-danger",
            )}
          >
            {icon}
          </div>
        ) : null}
        <div>
          <div className="font-display text-xl font-semibold text-contrast">{title}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">{body}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  </Panel>
);

interface TimelineItemProps {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}

export const TimelineItem: FC<TimelineItemProps> = ({ title, subtitle, right, children }) => (
  <div className="relative pl-5">
    <div className="absolute left-0 top-2 h-2.5 w-2.5 rounded-full bg-primary" />
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium text-contrast">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
    {children ? <div className="mt-3">{children}</div> : null}
  </div>
);

interface GhostButtonProps {
  children: ReactNode;
  onClick?: () => void;
}

export const GhostButton: FC<GhostButtonProps> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-primary/25 hover:text-contrast"
  >
    {children}
  </button>
);

interface HeroBadgeProps {
  text: ReactNode;
}

export const HeroBadge: FC<HeroBadgeProps> = ({ text }) => (
  <StatusPill tone="accent">
    <Sparkles className="h-3.5 w-3.5" />
    {text}
  </StatusPill>
);

