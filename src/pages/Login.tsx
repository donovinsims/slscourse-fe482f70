import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";

const Login = () => {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email: email.trim() },
      });

      if (error) {
        let message = "Failed to send login link. Please try again.";
        if (error instanceof FunctionsHttpError) {
          const payload = await error.context.json().catch(() => null);
          message = payload?.error ?? message;
        }

        setErrorMessage(message);
        toast.error(message);
        console.error(error);
        return;
      }

      if (!data?.success) {
        const message = data?.error ?? "Failed to send login link. Please try again.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      setSent(true);
      toast.success("If an account is available for this email, a sign-in link is on the way.");
    } catch (err) {
      const message = "Failed to send login link. Please try again.";
      setErrorMessage(message);
      toast.error(message);
      console.error(err);
    } finally {
      setSending(false);
    }
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
            Enter your email to receive a magic sign-in link for your dashboard.
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
              If an account is available for <strong className="text-foreground">{email}</strong>, a login link is on its way.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              If you have not purchased the course yet, use the button below to get access first.
            </p>
            <Button variant="outline" className="w-full mb-4" asChild>
              <a href="/">Purchase Course Access</a>
            </Button>
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
            {errorMessage && (
              <p className="text-sm text-destructive">
                {errorMessage} If you already paid, wait a minute and try again, then contact support if it still fails.
              </p>
            )}
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
