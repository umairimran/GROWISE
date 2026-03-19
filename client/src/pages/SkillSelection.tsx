import { FC, useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Loader2, Sparkles } from "lucide-react";
import { assessmentService } from "../api/services/assessment";
import { tracksService } from "../api/services/tracks";
import { ApiHttpError } from "../api/http";
import { Button } from "../components/Button";
import type { components } from "../api/generated/openapi";

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
      // 1. Store user's track selection
      try {
        await tracksService.select(track.track_id);
      } catch (error) {
        if (!(error instanceof ApiHttpError) || error.status !== 400) {
          throw error;
        }
      }

      // 2. Create session — backend generates dimensions-aware questions, stores in DB, returns session
      const session = await assessmentService.createSession(track.track_id);

      // 3. Navigate to assessment — questions are loaded from DB
      onSelect({ sessionId: session.session_id, track });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not start assessment for this track."));
    } finally {
      setStartingTrackId(null);
    }
  };

  const selectedTrack = startingTrackId ? tracks.find((t) => t.track_id === startingTrackId) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-sans pt-20 relative">
      {/* Full-screen loading overlay when generating assessment */}
      {selectedTrack && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 dark:bg-background/98 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center max-w-md text-center px-6">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
              <Loader2 className="h-16 w-16 text-blue-500 animate-spin relative z-10" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-contrast mb-3">
              Generating Your Assessment
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              Preparing personalized questions for <span className="font-semibold text-contrast">{selectedTrack.track_name}</span>
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Using dimensions to generate 10 tailored questions. This may take a moment…
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-contrast transition-colors group text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </button>

        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold text-contrast mb-4 opacity-0 animate-fade-in-up delay-100">
          Select Your Track
        </h1>
        <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-12 max-w-2xl opacity-0 animate-fade-in-up delay-200">
          Choose a learning track to start your personalized assessment. Our AI will generate questions tailored to your chosen domain.
        </p>

        {errorMessage && (
          <div className="mb-8 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}

        {isLoadingTracks ? (
          <div className="bg-surface border border-border rounded-2xl p-10 shadow-soft flex flex-col items-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4" />
            <p className="text-gray-500">Loading tracks from API...</p>
          </div>
        ) : tracks.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-10 shadow-soft flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl font-bold text-contrast mb-2">No Tracks Available Yet</h2>
            <p className="text-gray-500 mb-6 max-w-md">
              The backend returned an empty track list. Create tracks on the server, then refresh.
            </p>
            <Button onClick={() => loadTracks(true)} isLoading={isRefreshing}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tracks.map((track, index) => {
              const isStarting = startingTrackId === track.track_id;

              return (
                <div
                  key={track.track_id}
                  className="relative p-6 md:p-8 bg-surface dark:bg-white/[0.03] border border-border rounded-2xl hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-500/5 dark:hover:shadow-blue-500/10 transition-all duration-300 text-left group overflow-hidden opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${(index + 3) * 80}ms` }}
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-2xl" />
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/20 dark:group-hover:bg-blue-500/30 transition-colors">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-xl md:text-2xl font-bold text-contrast mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                        {track.track_name}
                      </h3>
                      <p className="text-sm md:text-base text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">
                        {track.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      onClick={() => handleTrackSelection(track)}
                      isLoading={isStarting}
                      disabled={startingTrackId !== null}
                      className="group/button min-w-[180px]"
                    >
                      Start Assessment
                      {!isStarting && (
                        <ArrowRight className="h-4 w-4 ml-2 group-hover/button:translate-x-1 transition-transform" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
