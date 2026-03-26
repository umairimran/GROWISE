import { FC, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Layers3,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "../components/Button";
import Threads from "../components/Threads";
import { User } from "../types";
import {
  MarketingHero,
  MarketingSection,
  PillRow,
} from "../components/marketing-layout";
import { Panel, StatusPill } from "../components/ui";
import { useTheme } from "../providers/ThemeProvider";

interface HomeProps {
  onStart: () => void;
  onLoginClick?: () => void;
  user?: User | null;
  onDashboardClick?: () => void;
  onChooseTrackClick?: () => void;
  onBlogClick?: () => void;
  onLogout?: () => void;
  onDemoClick?: () => void;
}

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Senior Frontend Dev",
    quote:
      "I skipped 40 hours of basic React tutorials. Grow Wise took me straight to Concurrency and Suspense.",
  },
  {
    name: "Marcus J.",
    role: "Backend Engineer",
    quote:
      "The validator is brutal. It flagged my O(n^2) sort immediately. Exactly the feedback I needed.",
  },
  {
    name: "Elena R.",
    role: "Full Stack Dev",
    quote:
      "Finally, a course that respects my time. The adaptive assessment is scary accurate.",
  },
];

const featureRows = [
  {
    icon: Target,
    title: "Adaptive assessment",
    description:
      "A focused evaluation that maps where you are strong, where you are brittle, and what to skip.",
  },
  {
    icon: BookOpen,
    title: "Precision curriculum",
    description:
      "Learning paths are generated around your gaps, not a generic syllabus that treats everyone the same.",
  },
  {
    icon: Zap,
    title: "Validator workflow",
    description:
      "Interview-style scenarios turn knowledge into proof, with a cleaner route to progress analysis.",
  },
];

const stats = [
  { label: "Assessment length", value: "50 min" },
  { label: "Core workflow", value: "4 stages" },
  { label: "Experience", value: "Personalized per learner" },
  { label: "Learning mode", value: "Adaptive" },
];

export const Home: FC<HomeProps> = ({
  onStart,
  onLoginClick,
  user,
  onDashboardClick,
  onChooseTrackClick,
  onBlogClick,
  onDemoClick,
}) => {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsDark(theme === "dark");
      return;
    }

    if (theme === "dark") {
      setIsDark(true);
      return;
    }

    if (theme === "light") {
      setIsDark(false);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setIsDark(mediaQuery.matches);

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);
    return () => mediaQuery.removeEventListener("change", syncTheme);
  }, [theme]);

  const primaryAction = user ? (
    <Button size="lg" onClick={onDashboardClick} className="min-w-44">
      Go to dashboard
      <ArrowRight className="h-4 w-4" />
    </Button>
  ) : (
    <Button size="lg" onClick={onStart} className="min-w-44">
      Start free assessment →
    </Button>
  );

  const secondaryAction = user ? (
    <Button size="lg" variant="outline" onClick={onChooseTrackClick}>
      Choose track
    </Button>
  ) : (
    <Button size="lg" variant="outline" onClick={onDemoClick}>
      View product tour
    </Button>
  );

  return (
    <div className="pt-16">
      <MarketingHero
        badge={
          <StatusPill tone="accent">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered skill validation
          </StatusPill>
        }
        title={
          <>
            The learning product for people who do not need another generic course.
          </>
        }
        description={
          <>
            Grow Wise maps what you already know, fills only the real gaps, and keeps every step
            sharp, readable, and purposeful.
          </>
        }
        background={
          isDark ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-[rgba(8,12,18,0.35)]" />
              <div className="absolute inset-x-0 top-0 h-full min-h-[600px] opacity-75 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.95),rgba(0,0,0,0.6),transparent)]">
                <Threads
                  amplitude={1}
                  distance={0}
                  enableMouseInteraction
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[rgba(11,16,23,0.7)]" />
            </>
          ) : null
        }
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        actionsFooter={
          !user ? (
            <p className="text-xs text-muted-foreground">No account required · Takes under 10 minutes</p>
          ) : null
        }
        stats={stats}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="metric-strip">
              <div className="metric-label">Assessment</div>
              <div className="metric-value text-[1.85rem]">Adaptive</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Adapts difficulty based on your responses</p>
            </div>
            <div className="metric-strip">
              <div className="metric-label">Validator</div>
              <div className="metric-value text-[1.85rem]">Scenario-led</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Real-world problems, not textbook questions</p>
            </div>
          </div>
          <PillRow items={["Curated tracks", "Progress analysis", "Mentor chat", "Picks up where you left off"]} />
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="Core signals"
        title="Three tools. One coherent system."
        description="Assessment, curriculum, and validation — designed to work together."
      >
        <div className="grid gap-5 md:grid-cols-3">
          {featureRows.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Panel key={feature.title} className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-contrast">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <span className="uppercase tracking-[0.18em]">0{index + 1}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </Panel>
            );
          })}
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrow="Proof"
        title="How it works"
        description="From assessment to learning path to validation — a clear, connected flow."
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <Panel className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="metric-label">Product flow</div>
                <h3 className="mt-2 font-display text-2xl font-semibold text-contrast">
                  From assessment to learning path
                </h3>
              </div>
              <StatusPill tone="neutral">
                <BarChart3 className="h-3.5 w-3.5" />
                Structured
              </StatusPill>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                "Assess what matters",
                "Generate the right path",
                "Validate in context",
              ].map((item, index) => (
                <div key={item} className="metric-strip">
                  <div className="text-2xl font-bold text-primary">0{index + 1}</div>
                  <div className="metric-label mt-1">Step {index + 1}</div>
                  <div className="mt-2 text-base font-semibold text-contrast">{item}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-display text-2xl font-semibold text-contrast">Signals</h3>
            </div>
            <div className="mt-5 space-y-3">
              {[
                "Public pages and your personal workspace feel connected but distinct.",
                "Every interaction feels part of one coherent product.",
                "Works beautifully on any device, in any lighting.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrow="What people say"
        title="Short, direct feedback from builders."
        description="The product should feel credible before a user ever enters the app."
      >
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((item) => (
            <Panel key={item.name} className="p-6">
              <p className="text-lg leading-8 text-contrast">"{item.quote}"</p>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-contrast text-background font-bold">
                  {item.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-contrast">{item.name}</div>
                  <div className="text-sm text-muted-foreground">{item.role}</div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrow="Pricing"
        title="Start free. Upgrade when you're ready."
        description="Transparent pricing. No surprises."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              name: "Starter",
              price: "$0",
              period: "",
              note: "Start building your learning path — no credit card needed.",
              items: ["1 assessment / month", "Public profile", "Core dashboard"],
              featured: false,
              buttonText: "Start free",
              buttonAction: user ? onDashboardClick : onStart,
            },
            {
              name: "Pro",
              price: "$15",
              period: "/month",
              note: "For users who want the full adaptive learning loop.",
              items: ["Unlimited assessments", "AI curriculum generation", "Validator access", "Mentor chat"],
              featured: true,
              buttonText: "Get started",
              buttonAction: user ? onDashboardClick : onStart,
            },
            {
              name: "Team",
              price: "$99",
              period: "/seat",
              note: "For groups that need a shared skill baseline and tracking.",
              items: ["Team dashboards", "Custom tracks", "Admin controls", "Priority support", "Custom assessments"],
              featured: false,
              buttonText: "Contact us",
              buttonAction: user ? onDashboardClick : onStart,
            },
          ].map((tier) => (
            <Panel
              key={tier.name}
              className={tier.featured ? "border-primary/20 bg-primary/5 p-6 shadow-halo" : "p-6"}
            >
              <div className="flex items-center justify-between gap-4">
                <StatusPill tone={tier.featured ? "accent" : "neutral"}>{tier.name}</StatusPill>
                {tier.featured ? <StatusPill tone="success">Most used</StatusPill> : null}
              </div>
              <div className="mt-5 flex items-end gap-2">
                <div className="font-display text-5xl font-semibold text-contrast">{tier.price}</div>
                {tier.period ? <div className="pb-1 text-sm text-muted-foreground">{tier.period}</div> : null}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{tier.note}</p>
              <div className="mt-6 space-y-3">
                {tier.items.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-contrast">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button
                  variant={tier.featured ? "primary" : "outline"}
                  className="w-full"
                  onClick={tier.buttonAction}
                >
                  {tier.buttonText}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </MarketingSection>

      <section className="page-section-cta py-10 sm:py-14">
        <div className="page-shell">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="section-label">Get started</div>
                <h2 className="mt-4 font-display text-5xl font-bold tracking-[-0.04em] text-contrast sm:text-6xl">
                  Stop relearning. Start growing.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                  Your time is too valuable for generic courses. Let Grow Wise build the path that
                  actually moves you forward.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {user ? (
                  <Button size="lg" onClick={onDashboardClick}>
                    Open dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="lg" onClick={onStart}>
                    Begin assessment →
                  </Button>
                )}
              </div>
            </div>
        </div>
      </section>

      <footer className="border-t border-border/70 bg-surface/45">
        <div className="page-shell flex flex-col gap-6 px-1 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Layers3 className="h-4 w-4" />
              </div>
              <div>
                <div className="font-display text-2xl font-semibold text-contrast">Grow Wise</div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Mastery, minus the redundancy
                </div>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Built for developers who value precision over volume.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={onBlogClick}>
              Blog
            </Button>
            {!user && onLoginClick ? (
              <Button variant="outline" onClick={onLoginClick}>
                Login
              </Button>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
};
