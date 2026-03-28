import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Login = () => {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/portal");
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
      },
    });

    if (error) {
      toast.error("Failed to send login link. Please try again.");
      console.error(error);
    } else {
      setSent(true);
      toast.success("Check your email for the login link!");
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <p className="font-script text-primary text-xl mb-2">Welcome back</p>
          <h1 className="font-display text-4xl font-semibold text-foreground mb-2">
            Sign In
          </h1>
          <p className="text-muted-foreground">
            Enter your email to receive a magic login link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg bg-card p-8 text-center shadow-md border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              Check Your Email
            </h2>
            <p className="text-muted-foreground mb-6">
              We've sent a login link to <strong className="text-foreground">{email}</strong>
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-primary underline hover:text-primary/80 transition-colors text-sm"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-0 border-b-2 border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Button
              type="submit"
              disabled={sending}
              variant="cta"
              className="w-full"
              size="lg"
            >
              {sending ? "Sending..." : "Send Login Link"}
            </Button>
          </form>
        )}

        <div className="text-center">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
