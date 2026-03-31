import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAccessState } from "@/hooks/use-access-state";

interface Video {
  id: string;
  title: string;
  description: string;
  sort_order: number;
  module: string;
  summary: string;
}

const Portal = () => {
  const { user, loading, signOut } = useAuth();
  const access = useAccessState();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user || access.loading) return;

    const canAccess = access.isAdmin || access.hasCourseAccess;
    if (!canAccess) {
      setLoadingError(null);
      setLoadingData(false);
      return;
    }

    const loadVideos = async () => {
      setLoadingData(true);
      setLoadingError(null);
      const { data, error } = await supabase.rpc("get_course_videos");
      if (error) {
        const message = "We confirmed your access, but couldn't load the course library.";
        toast.error(message);
        console.error(error);
        setLoadingError(message);
      } else {
        setVideos(data ?? []);
      }
      setLoadingData(false);
    };

    void loadVideos();
  }, [access.hasCourseAccess, access.isAdmin, access.loading, reloadKey, user]);

  const isLoadingScreen =
    loading || access.loading || ((access.isAdmin || access.hasCourseAccess) && loadingData);

  if (isLoadingScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your course...</p>
      </div>
    );
  }

  if (access.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="font-display text-3xl font-semibold text-foreground mb-4">
            We Couldn&apos;t Load Your Access
          </h1>
          <p className="text-muted-foreground mb-6">{access.error}</p>
          <div className="flex flex-col gap-3">
            <Button variant="cta" size="lg" onClick={() => void access.refresh()}>
              Retry Access Check
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:donovinsims@gmail.com">Contact Support</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="font-display text-3xl font-semibold text-foreground mb-4">
            We Found Your Access
          </h1>
          <p className="text-muted-foreground mb-6">
            {loadingError} Try again now, and contact support if the library still does not load.
          </p>
          <div className="flex flex-col gap-3">
            <Button variant="cta" size="lg" onClick={() => setReloadKey((value) => value + 1)}>
              Retry Library Load
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:donovinsims@gmail.com">Contact Support</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!access.isAdmin && !access.hasCourseAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="font-display text-3xl font-semibold text-foreground mb-4">
            We Couldn&apos;t Match This Login To Course Access
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account is signed in as {access.email || "this email"}, but we could not find active course access yet. If you paid with another email, sign out and request a link for that inbox.
          </p>
          <div className="space-y-3">
            <Button variant="cta" size="lg" className="w-full" asChild>
              <Link to="/login">Request a Fresh Login Link</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={signOut}>
              Use a Different Email
            </Button>
            <Button variant="outline" size="lg" className="w-full" asChild>
              <a href="mailto:donovinsims@gmail.com">Contact Support</a>
            </Button>
            <Link to="/" className="inline-block text-sm text-muted-foreground underline hover:text-foreground transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Group videos by module
  const modules = videos.reduce<Record<string, Video[]>>((acc, video) => {
    if (!acc[video.module]) acc[video.module] = [];
    acc[video.module].push(video);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Course Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            {access.isAdmin && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin">Manage Access</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-12">
        <div>
          <p className="font-script text-primary text-lg">Your journey begins</p>
          <h2 className="font-display text-3xl font-semibold text-foreground">
            Master Day Trading — 24 Lessons
          </h2>
          <p className="text-muted-foreground mt-2">
            Open any lesson to watch the video, review the summary, and read the transcript.
          </p>
        </div>

        {Object.entries(modules).map(([moduleName, moduleVideos]) => (
          <section key={moduleName} className="space-y-4">
            <h3 className="font-display text-xl font-semibold text-foreground border-b border-border pb-2">
              {moduleName}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {moduleVideos.map((video) => (
                <Link
                  key={video.id}
                  to={`/watch/${video.id}`}
                  className="group block rounded-lg bg-card border border-border p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200"
                >
                  <Badge className="mb-3 bg-accent text-accent-foreground border-0 rounded-full text-xs">
                    {video.module}
                  </Badge>
                  <h4 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                    {video.sort_order}. {video.title}
                  </h4>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {video.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Watch →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};

export default Portal;
