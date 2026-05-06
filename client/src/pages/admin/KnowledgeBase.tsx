import { FC, useEffect, useState } from "react";
import {
  Database,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { adminService, KBEntry, Track } from "../../api/services/admin";

// ---------------------------------------------------------------------------
// Paste-text modal
// ---------------------------------------------------------------------------
interface AddTextModalProps {
  tracks: Track[];
  onClose: () => void;
  onSaved: () => void;
}

const AddTextModal: FC<AddTextModalProps> = ({ tracks, onClose, onSaved }) => {
  const [trackId, setTrackId] = useState(tracks[0]?.track_id ?? 0);
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!source.trim() || !content.trim()) {
      setErr("Source name and content are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await adminService.addKBEntry({ track_id: trackId, content, source });
      onSaved();
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Add KB Entry (Paste Text)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Track *</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {tracks.map((t) => (
                <option key={t.track_id} value={t.track_id}>
                  {t.track_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source / Label *
            </label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. ML Textbook Chapter 3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Content *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="Paste the text content here..."
            />
          </div>
        </div>

        {err && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {err}
          </p>
        )}

        <div className="flex gap-3 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Saving..." : "Add Entry"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// File upload modal
// ---------------------------------------------------------------------------
interface UploadFileModalProps {
  tracks: Track[];
  onClose: () => void;
  onUploaded: () => void;
}

const UploadFileModal: FC<UploadFileModalProps> = ({ tracks, onClose, onUploaded }) => {
  const [trackId, setTrackId] = useState(tracks[0]?.track_id ?? 0);
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) { setErr("Please select a file."); return; }
    if (!source.trim()) { setErr("Source name is required."); return; }
    setUploading(true);
    setErr(null);
    try {
      const res = await adminService.uploadKBFile(trackId, source, file);
      setSuccess(res.message);
      setTimeout(() => { onUploaded(); }, 1500);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Upload File to Knowledge Base
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Track *</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {tracks.map((t) => (
                <option key={t.track_id} value={t.track_id}>
                  {t.track_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source / Label *
            </label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. PyTorch Documentation v2.3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              File (.txt, .md, .pdf)
            </label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors">
              <Upload className="w-6 h-6 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">
                {file ? file.name : "Click to choose or drag & drop"}
              </span>
              <input
                type="file"
                accept=".txt,.md,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        {err && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {err}
          </p>
        )}
        {success && (
          <p className="mt-3 text-xs text-emerald-600">{success}</p>
        )}

        <div className="flex gap-3 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// KB Entry row with expandable content
// ---------------------------------------------------------------------------
interface KBRowProps {
  entry: KBEntry;
  onDelete: (id: number) => void;
}

const KBRow: FC<KBRowProps> = ({ entry, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3 py-3">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400">#{entry.kb_id}</span>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {entry.source}
            </span>
          </div>
          {!expanded && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {entry.content}
            </p>
          )}
          {expanded && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap">
              {entry.content}
            </p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onDelete(entry.kb_id)}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const KnowledgeBase: FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"text" | "file" | null>(null);

  useEffect(() => {
    adminService.listTracks().then((t) => {
      setTracks(t);
      if (t.length > 0) setSelectedTrack(t[0].track_id);
    });
  }, []);

  useEffect(() => {
    if (selectedTrack !== null) loadEntries(selectedTrack);
  }, [selectedTrack]);

  const loadEntries = async (trackId: number) => {
    setLoading(true);
    try {
      const data = await adminService.getKnowledgeBase(trackId);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminService.deleteKBEntry(id);
      setEntries((prev) => prev.filter((e) => e.kb_id !== id));
    } catch (e: unknown) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  };

  const handleSaved = () => {
    setModal(null);
    if (selectedTrack !== null) loadEntries(selectedTrack);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Knowledge Base</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Documents the AI mentor reads when answering questions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => selectedTrack !== null && loadEntries(selectedTrack)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setModal("text")}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium"
          >
            <Plus className="w-4 h-4" />
            Paste Text
          </button>
          <button
            onClick={() => setModal("file")}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Upload className="w-4 h-4" />
            Upload File
          </button>
        </div>
      </div>

      {/* Track selector */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-gray-400" />
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Track:</label>
          <select
            value={selectedTrack ?? ""}
            onChange={(e) => setSelectedTrack(Number(e.target.value))}
            className="flex-1 max-w-xs px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {tracks.map((t) => (
              <option key={t.track_id} value={t.track_id}>
                {t.track_name}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-400">{entries.length} entries</span>
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading entries...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
            <Database className="w-8 h-8" />
            <p className="text-sm">No entries for this track yet.</p>
            <p className="text-xs">Upload a file or paste text to get started.</p>
          </div>
        ) : (
          <div>
            {entries.map((entry) => (
              <KBRow key={entry.kb_id} entry={entry} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "text" && tracks.length > 0 && (
        <AddTextModal
          tracks={tracks}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal === "file" && tracks.length > 0 && (
        <UploadFileModal
          tracks={tracks}
          onClose={() => setModal(null)}
          onUploaded={handleSaved}
        />
      )}
    </div>
  );
};
