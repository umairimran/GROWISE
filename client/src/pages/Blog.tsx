import { FC, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, FileText, Flame, Sparkles } from "lucide-react";
import { Button } from "../components/Button";
import { MarketingCard, MarketingPost } from "../components/marketing-card";
import { MarketingHero, MarketingSection, PillRow } from "../components/marketing-layout";
import { Panel, StatusPill } from "../components/ui";

interface BlogPageProps {
  onBack: () => void;
}

const INITIAL_BLOG_POSTS: MarketingPost[] = [
  {
    id: "1",
    title: "Introducing the 50-minute Adaptive Assessment",
    category: "Feature",
    description:
      "We rebuilt the core engine to reduce wasted time and improve the quality of the learning path that follows.",
    date: "Oct 24, 2024",
    authorName: "Sarah Chen",
    authorAvatar: "SC",
    gradient: "linear-gradient(135deg, rgba(24,94,79,0.16), rgba(255,255,255,0.8))",
  },
  {
    id: "2",
    title: "How the curriculum generator keeps context tight",
    category: "Engineering",
    description:
      "A look at the flow that turns assessment gaps into a readable learning path instead of a generic checklist.",
    date: "Oct 12, 2024",
    authorName: "David Kim",
    authorAvatar: "DK",
    gradient: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(255,255,255,0.75))",
  },
  {
    id: "3",
    title: "Validator scenarios that feel like real work",
    category: "Feature",
    description:
      "Why the interview-style path is a better proof layer than a static quiz and how it connects to progress reporting.",
    date: "Sep 28, 2024",
    authorName: "Marcus J.",
    authorAvatar: "MJ",
    gradient: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(255,255,255,0.78))",
  },
  {
    id: "4",
    title: "Understanding the knowledge map",
    category: "Education",
    description:
      "What a confidence score means, how to read it, and why it should change the way people study.",
    date: "Sep 15, 2024",
    authorName: "Elena R.",
    authorAvatar: "ER",
    gradient: "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(255,255,255,0.76))",
  },
  {
    id: "5",
    title: "Scaling the product without losing clarity",
    category: "Engineering",
    description:
      "Lessons from keeping dense dashboards fast, legible, and consistent across route transitions.",
    date: "Aug 30, 2024",
    authorName: "David Kim",
    authorAvatar: "DK",
    gradient: "linear-gradient(135deg, rgba(15,23,42,0.12), rgba(255,255,255,0.8))",
  },
  {
    id: "6",
    title: "What an AI tutor should feel like",
    category: "Announcements",
    description:
      "A product update on the pieces that matter most: trust, hierarchy, and keeping the interface quiet.",
    date: "Aug 10, 2024",
    authorName: "Sarah Chen",
    authorAvatar: "SC",
    gradient: "linear-gradient(135deg, rgba(99,102,241,0.16), rgba(255,255,255,0.78))",
  },
];

const FILTERS = ["All", "Feature", "Engineering", "Education", "Announcements"];

export const Blog: FC<BlogPageProps> = ({ onBack }) => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [posts] = useState<MarketingPost[]>(INITIAL_BLOG_POSTS);

  const filteredPosts = useMemo(
    () => (activeFilter === "All" ? posts : posts.filter((post) => post.category === activeFilter)),
    [activeFilter, posts],
  );

  return (
    <div className="pt-16">
      <MarketingHero
        badge={
          <StatusPill tone="accent">
            <Sparkles className="h-3.5 w-3.5" />
            Product notes
          </StatusPill>
        }
        title={<>Insights from the Grow Wise team.</>}
        description={
          <>
            Updates, engineering notes, and product decisions written to match the rest of the
            experience.
          </>
        }
        primaryAction={
          <Button size="lg" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Button>
        }
        secondaryAction={
          <Button size="lg" variant="outline" onClick={onBack}>
            Home
          </Button>
        }
        stats={[
          { label: "Articles", value: "6" },
          { label: "Focus", value: "Product + engineering" },
          { label: "Cadence", value: "Occasional" },
          { label: "Format", value: "Short-form" },
        ]}
      >
        <div className="space-y-4">
          <div className="rail-card">
            <div className="metric-label">Current issue</div>
            <div className="mt-2 text-2xl font-semibold text-contrast">
              Why the UI now feels like one product.
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Public pages, auth, and the learner workspace now share one surface system and one
              hierarchy.
            </p>
          </div>
          <PillRow items={["Feature notes", "Engineering", "Education", "Announcements"]} />
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="Filters"
        title="Read by topic."
        description="The filter bar stays lightweight so the page remains editorial instead of turning into a dense tool."
      >
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                activeFilter === filter
                  ? "border-primary bg-primary text-white shadow-soft"
                  : "border-border bg-surface/80 text-muted-foreground hover:border-primary/30 hover:text-contrast"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrow="Latest"
        title="A calmer layout for updates."
        description="The articles now feel like a product release stream rather than a placeholder blog."
      >
        {filteredPosts.length === 0 ? (
          <Panel className="p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 font-display text-2xl font-semibold text-contrast">
              No posts found
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Pick a different filter to see a matching set of updates.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post, index) => (
              <MarketingCard key={post.id} post={post} index={index} />
            ))}
          </div>
        )}
      </MarketingSection>

      <section className="page-section pb-12">
        <div className="page-shell">
          <div className="grid gap-5 lg:grid-cols-[0.9fr,1.1fr]">
            <Panel className="p-6">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                <h2 className="font-display text-2xl font-semibold text-contrast">Editorial cadence</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Updates are intentionally sparse. The goal is to communicate product changes, not
                create noise.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Assessment engine changes",
                  "Validator and reporting work",
                  "UI consistency notes",
                  "Onboarding and auth refinements",
                ].map((item) => (
                  <div key={item} className="metric-strip">
                    <div className="metric-label">Focus area</div>
                    <div className="mt-2 text-base font-semibold text-contrast">{item}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-6">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-warning" />
                <h2 className="font-display text-2xl font-semibold text-contrast">What this page is for</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Surface the product’s direction without relying on marketing filler.",
                  "Keep the update feed aligned with the same design system as the app.",
                  "Provide a clean place for future release notes and implementation writeups.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                    <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
};
