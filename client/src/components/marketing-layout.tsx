import { ComponentProps, FC, ReactNode } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "./Button";
import { Panel, SectionHeading, StatusPill, cn } from "./ui";

interface MarketingSectionProps {
  className?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export const MarketingSection: FC<MarketingSectionProps> = ({
  className,
  eyebrow,
  title,
  description,
  actions,
  children,
}) => (
  <section className={cn("page-section", className)}>
    <div className="page-shell space-y-8">
      <SectionHeading label={eyebrow} title={title} description={description} actions={actions} />
      {children}
    </div>
  </section>
);

interface HeroProps {
  badge?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  actionsFooter?: ReactNode;
  stats?: Array<{ label: string; value: string }>;
  background?: ReactNode;
  children?: ReactNode;
}

export const MarketingHero: FC<HeroProps> = ({
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  actionsFooter,
  stats,
  background,
  children,
}) => (
  <section className="page-section-hero pt-6 sm:pt-10">
    {background ? <div className="absolute inset-0">{background}</div> : null}
    <div className="page-shell relative">
      <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr,0.9fr] lg:items-end">
          <div className="space-y-6">
            {badge ? badge : (
              <StatusPill tone="accent">
                <Sparkles className="h-3.5 w-3.5" />
                Precision learning product
              </StatusPill>
            )}
            <div className="space-y-4">
              <h1 className="section-title max-w-3xl">{title}</h1>
              <p className="section-copy max-w-2xl">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {primaryAction}
              {secondaryAction}
            </div>
            {actionsFooter}
            {stats?.length ? (
              <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((item) => (
                  <div key={item.label} className="metric-strip">
                    <div className="metric-label">{item.label}</div>
                    <div className="metric-value">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-primary/15 blur-3xl" />
            <Panel className="relative p-5 sm:p-6">
              {children}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  </section>
);

interface ContentGridProps {
  children: ReactNode;
}

export const MarketingGrid: FC<ContentGridProps> = ({ children }) => (
  <div className="page-shell page-grid">{children}</div>
);

interface PillRowProps {
  items: string[];
}

export const PillRow: FC<PillRowProps> = ({ items }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => (
      <StatusPill key={item} tone="neutral">
        {item}
      </StatusPill>
    ))}
  </div>
);

export const ArrowButton = ({ children, ...props }: ComponentProps<typeof Button>) => (
  <Button {...props}>
    {children}
    <ArrowRight className="h-4 w-4" />
  </Button>
);
