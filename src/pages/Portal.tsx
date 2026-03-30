import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ADMIN_EMAILS = ["sls25trading@gmail.com", "emaildonovin@gmail.com", "donovinsims@gmail.com"];

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
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;

    const checkAccessAndLoadVideos = async () => {
      const email = user.email?.toLowerCase() ?? "";
      const isAdmin = ADMIN_EMAILS.includes(email);

      if (!isAdmin) {
        const { data: customer } = await supabase
          .from("customers")
          .select("course_access")
          .eq("email", email)
          .maybeSingle();

        if (!customer?.course_access) {
          setHasAccess(false);
          setLoadingData(false);
          return;
        }
      }

      // Admin or has access — ensure customer row exists for admins
      if (isAdmin) {
        await supabase.from("customers").upsert(
          { email, course_access: true },
          { onConflict: "email" }
        );
      }

      setHasAccess(true);

      const { data, error } = await supabase.rpc("get_course_videos");
      if (error) {
        toast.error("Failed to load videos");
        console.error(error);
      } else {
        setVideos(data ?? []);
      }
      setLoadingData(false);
    };

    checkAccessAndLoadVideos();
  }, [user]);

  if (loading || loadingData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your course...</p>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-3xl font-semibold text-foreground mb-4">
            No Active Purchase Found
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account doesn't have an active course subscription. Purchase the course to get access.
          </p>
          <Button variant="cta" size="lg" asChild>
            <a href="/">Get Access</a>
          </Button>
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
