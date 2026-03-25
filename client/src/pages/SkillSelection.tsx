import { FC, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Loader2,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { assessmentService } from "../api/services/assessment";
import { tracksService } from "../api/services/tracks";
import { ApiHttpError } from "../api/http";
import { Button } from "../components/Button";
import type { components } from "../api/generated/openapi";
import { Panel, StatusPill } from "../components/ui";

type TrackResponse = components["schemas"]["TrackResponse"];

interface SkillSelectionProps {
  onSelect: (selection: { sessionId: number; track: TrackResponse }) => void;
  onBack: () => void;
}

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const SkillSelection: FC<SkillSelectionProps> = ({ onSelect, onBack }) => {
  const [tracks, setTracks] = useState<TrackResponse[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startingTrackId, setStartingTrackId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTracks = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoadingTracks(true);
    }

    setErrorMessage(null);

    try {
      const availableTracks = await tracksService.list();
      setTracks(availableTracks);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to load tracks."));
      setTracks([]);
    } finally {
      setIsLoadingTracks(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  const handleTrackSelection = async (track: TrackResponse) => {
    setStartingTrackId(track.track_id);
    setErrorMessage(null);

    try {
      try {
        await tracksService.select(track.track_id);
      } catch (error) {
        if (!(error instanceof ApiHttpError) || error.status !== 400) {
          throw error;
        }
      }

      const session = await assessmentService.createSession(track.track_id);
      onSelect({ sessionId: session.session_id, track });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not start assessment for this track."));
    } finally {
      setStartingTrackId(null);
    }
  };

  const selectedTrack = startingTrackId ? tracks.find((t) => t.track_id === startingTrackId) : null;
  const trackHighlights = useMemo(
    () => [
      { label: "Tailored questions", value: "10+" },
      { label: "Generated on demand", value: "Live" },
      { label: "Session output", value: "Assessment" },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-background pt-16">
      {selectedTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <Panel className="mx-4 max-w-xl p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <h2 className="font-display text-3xl font-semibold text-contrast">
              Generating your assessment
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Preparing tailored questions for <span className="font-semibold text-contrast">{selectedTrack.track_name}</span>.
            </p>
          </Panel>
        </div>
      )}

      <div className="page-shell py-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
          <Panel className="p-6 sm:p-8">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-contrast"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </button>

            <div className="mt-6 space-y-4">
              <StatusPill tone="accent">
                <Sparkles className="h-3.5 w-3.5" />
                Onboarding step
              </StatusPill>
              <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-contrast sm:text-5xl">
                Choose a track.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Select the area you want to validate. The assessment session is generated from the
                track you choose here.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {trackHighlights.map((item) => (
                <div key={item.label} className="metric-strip">
                  <div className="metric-label">{item.label}</div>
                  <div className="metric-value text-[1.65rem]">{item.value}</div>
                </div>
              ))}
            </div>

          </Panel>

          <div className="space-y-5">
            {errorMessage && (
              <div className="status-banner" data-tone="error">
                <AlertCircle className="mt-0.5 h-4 w-4 text-danger" />
                <p className="text-sm leading-6 text-contrast">{errorMessage}</p>
              </div>
            )}

            {isLoadingTracks ? (
              <Panel className="p-10 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="mt-4 text-sm text-muted-foreground">Loading tracks from the API...</p>
              </Panel>
            ) : tracks.length === 0 ? (
              <Panel className="p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <WandSparkles className="h-6 w-6" />
                </div>
                <h2 className="mt-5 font-display text-3xl font-semibold text-contrast">
                  No tracks available yet
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  The backend returned an empty track list. Create tracks on the server, then refresh.
                </p>
                <Button onClick={() => loadTracks(true)} isLoading={isRefreshing} className="mt-6">
                  Retry
                </Button>
              </Panel>
            ) : (
              <div className="grid gap-4">
                {tracks.map((track, index) => {
                  const isStarting = startingTrackId === track.track_id;

                  return (
                    <Panel
                      key={track.track_id}
                      className="group p-6 transition-all hover:border-primary/20 hover:shadow-halo"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <BookOpen className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-contrast">
                              {track.track_name}
                            </h3>
                            <StatusPill tone="neutral">Track {index + 1}</StatusPill>
                          </div>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                            {track.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Personalized assessment generation
                        </div>
                        <Button
                          onClick={() => handleTrackSelection(track)}
                          isLoading={isStarting}
                          disabled={startingTrackId !== null}
                        >
                          Start assessment
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
