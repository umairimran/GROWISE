import { FC, HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

export const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const PageHeader: FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn("flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
    <div className="max-w-3xl space-y-3">
      {eyebrow ? <div>{eyebrow}</div> : null}
      <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-contrast sm:text-5xl">
        {title}
      </h1>
      {description ? <p className="section-copy max-w-2xl">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
  </div>
);

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  muted?: boolean;
  tone?: "default" | "danger";
}

export const Panel: FC<PanelProps> = ({
  className,
  muted = false,
  tone = "default",
  ...props
}) => (
  <div
    className={cn(
      "app-panel",
      muted && "app-panel-muted",
      tone === "danger" && "border-danger/20 bg-danger/5",
      className,
    )}
    {...props}
  />
);

interface SectionHeadingProps {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const SectionHeading: FC<SectionHeadingProps> = ({
  label,
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
    <div className="space-y-2">
      {label ? <div className="section-label">{label}</div> : null}
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-contrast">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

interface StatusPillProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}

const statusToneMap: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  neutral: "border-border bg-surface text-contrast",
  accent: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export const StatusPill: FC<StatusPillProps> = ({ children, tone = "neutral", className }) => (
  <span className={cn("app-pill", statusToneMap[tone], className)}>{children}</span>
);

interface InlineNoticeProps {
  title?: ReactNode;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  action?: ReactNode;
  className?: string;
}

const noticeIconMap = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
} as const;

export const InlineNotice: FC<InlineNoticeProps> = ({
  title,
  children,
  tone = "info",
  action,
  className,
}) => {
  const Icon = noticeIconMap[tone];

  return (
    <div className={cn("status-banner", className)} data-tone={tone === "info" ? undefined : tone}>
      <div className="mt-0.5 rounded-full p-1.5 bg-black/5 dark:bg-white/5">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {title ? <div className="font-medium text-contrast">{title}</div> : null}
        <div className="text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

export const EmptyState: FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <Panel className={cn("p-8 sm:p-10 text-center", className)} muted>
    {icon ? (
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
    ) : null}
    <h3 className="font-display text-2xl font-semibold text-contrast">{title}</h3>
    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </Panel>
);
