import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AccessState {
  email: string;
  isAdmin: boolean;
  hasCourseAccess: boolean;
}

export const useAccessState = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const userEmail = user?.email ?? "";
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAccessState(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadAccessState = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke("get-access-state");

      if (cancelled) return;

      if (error || !data) {
        console.error("[useAccessState] Failed to load access state:", error);

        if (error instanceof FunctionsHttpError && error.context.status === 401) {
          await signOut();
          if (cancelled) return;

          setAccessState(null);
          setError(null);
          setLoading(false);
          return;
        }

        setAccessState(null);
        setError("Please sign in again. If this keeps happening, contact support.");
        setLoading(false);
        return;
      }

      setAccessState({
        email: data.email ?? userEmail,
        isAdmin: Boolean(data.isAdmin),
        hasCourseAccess: Boolean(data.hasCourseAccess),
      });
      setLoading(false);
    };

    void loadAccessState();

    return () => {
      cancelled = true;
    };
  }, [authLoading, reloadKey, signOut, user, userEmail]);

  return {
    accessState,
    email: accessState?.email ?? userEmail,
    isAdmin: accessState?.isAdmin ?? false,
    hasCourseAccess: accessState?.hasCourseAccess ?? false,
    loading: authLoading || loading,
    error,
    refresh: () => setReloadKey((value) => value + 1),
  };
};
