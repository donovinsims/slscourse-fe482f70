import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  AUTH_CALLBACK_ERROR_KEY,
  completeAuthFromUrl,
  hasAuthCallbackParams,
} from "@/lib/auth-callback";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const hasAuthCallback =
      typeof window !== "undefined" && hasAuthCallbackParams(window.location.href);
    let bootstrapping = true;

    // CRITICAL: Set up auth listener BEFORE getSession to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (bootstrapping && hasAuthCallback && event === "INITIAL_SESSION" && !session) {
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    void (async () => {
      try {
        if (hasAuthCallback && typeof window !== "undefined") {
          const result = await completeAuthFromUrl(
            supabase,
            window.location.href,
            (nextUrl) => window.history.replaceState({}, document.title, nextUrl),
          );

          if (result.error) {
            window.sessionStorage.setItem(AUTH_CALLBACK_ERROR_KEY, result.error);
          } else if (result.handled) {
            window.sessionStorage.removeItem(AUTH_CALLBACK_ERROR_KEY);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
      } finally {
        bootstrapping = false;
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
