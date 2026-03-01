import { FC, useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, RefreshCw, Sparkles } from "lucide-react";
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
      try {
        await tracksService.select(track.track_id);
      } catch (error) {
        // Retakes are valid; backend returns 400 when the same track was already selected before.
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-sans pt-20">
      <div className="w-full max-w-5xl">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-contrast transition-colors group text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadTracks(true)}
            isLoading={isRefreshing}
            disabled={isLoadingTracks}
            className="text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Tracks
          </Button>
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold text-contrast mb-4 opacity-0 animate-fade-in-up delay-100">
          Select Your Track
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-3xl opacity-0 animate-fade-in-up delay-200">
          Tracks are now loaded from the backend. Pick one to create your assessment session and begin the
          diagnostic flow.
        </p>

        {errorMessage && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-start gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tracks.map((track, index) => {
              const isStarting = startingTrackId === track.track_id;

              return (
                <div
                  key={track.track_id}
                  className="p-6 bg-surface border border-border rounded-xl hover:border-accent hover:shadow-lg hover:shadow-accent/5 transition-all text-left group opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${(index + 3) * 80}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-display text-xl font-bold text-contrast mb-2 group-hover:text-accent transition-colors duration-300">
                        {track.track_name}
                      </h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{track.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 border border-gray-200 rounded-full px-2 py-1">
                      #{track.track_id}
                    </span>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      onClick={() => handleTrackSelection(track)}
                      isLoading={isStarting}
                      disabled={startingTrackId !== null}
                      className="group/button"
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
