import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_EMAILS = ["sls25trading@gmail.com", "emaildonovin@gmail.com", "donovinsims@gmail.com"];

const Watch = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user || !videoId) return;

    const loadVideo = async () => {
      try {
        const email = user.email?.toLowerCase() ?? "";
        const isAdmin = ADMIN_EMAILS.includes(email);

        if (!isAdmin) {
          const { data: customer } = await supabase
            .from("customers")
            .select("course_access")
            .eq("email", email)
            .maybeSingle();

          if (!customer?.course_access) {
            setError("No active purchase found.");
            setLoadingVideo(false);
            return;
          }
        }

        const fp = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(fp));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fingerprint = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const { data, error: fnError } = await supabase.functions.invoke("get-video", {
          body: { videoId, fingerprint },
        });

        if (fnError || !data?.embedUrl) {
          setError("Failed to load video. Please try again.");
          console.error(fnError || data);
          setLoadingVideo(false);
          return;
        }

        setEmbedUrl(data.embedUrl);
        setVideoTitle(data.title ?? "");
        setVideoDescription(data.description ?? "");
        setTranscript(data.transcript ?? "");
        setSummary(data.summary ?? "");
      } catch (err) {
        console.error(err);
        setError("An unexpected error occurred.");
      }
      setLoadingVideo(false);
    };

    loadVideo();
  }, [user, videoId]);

  // Format transcript into readable paragraphs
  const formatTranscript = (text: string) => {
    if (!text) return [];
    // Split on double newlines or long gaps, create paragraphs from chunks
    const lines = text.split(/\n{2,}/);
    if (lines.length > 1) return lines.filter(l => l.trim());
    // If no paragraph breaks, chunk by sentences roughly every 3-4 sentences
    const sentences = text.split(/(?<=[.!?])\s+/);
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 4) {
      paragraphs.push(sentences.slice(i, i + 4).join(" "));
    }
    return paragraphs;
  };

  if (loading || loadingVideo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-semibold text-foreground mb-4">{error}</h1>
          <Link to="/portal" className="text-primary underline hover:text-primary/80">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const transcriptParagraphs = formatTranscript(transcript);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link to="/portal" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* Video Player */}
        <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-lg bg-foreground/5">
          {embedUrl && (
            <iframe
              src={embedUrl}
              title={videoTitle}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>

        {/* Title & Summary */}
        <div className="space-y-4">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">
            {videoTitle}
          </h1>

          {summary && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-primary text-lg">📝</span>
                <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
                  Quick Summary
                </h2>
              </div>
              <p className="text-foreground/80 leading-relaxed text-sm sm:text-base">
                {summary}
              </p>
            </div>
          )}
        </div>

        {/* Transcript Section */}
        {transcript && (
          <div className="space-y-3">
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className={`transition-transform duration-200 ${showTranscript ? "rotate-90" : ""}`}>
                ▶
              </span>
              <span className="uppercase tracking-wide">
                {showTranscript ? "Hide Transcript" : "Show Transcript"}
              </span>
            </button>

            {showTranscript && (
              <div
                ref={transcriptRef}
                className="rounded-lg border border-border bg-card p-4 sm:p-6 max-h-[500px] overflow-y-auto scroll-smooth"
              >
                <div className="space-y-4">
                  {transcriptParagraphs.map((paragraph, i) => (
                    <p
                      key={i}
                      className="text-sm text-muted-foreground leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Watch;
