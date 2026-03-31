import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "success" | "already" | "error";

const Success = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      setStatus("error");
      setErrorMsg("No payment session found. If you completed a purchase, please contact support.");
      return;
    }

    // Prevent double-fire from React strict mode
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-purchase", {
          body: { sessionId },
        });

        if (error || !data?.success) {
          setStatus("error");
          setErrorMsg(
            data?.error ?? "Could not verify this payment session. Please contact support with your payment confirmation."
          );
          return;
        }

        setEmail(data.email ?? "");
        setEmailSent(Boolean(data.emailSent));
        setAccessGranted(Boolean(data.accessGranted));
        setStatus(data.alreadyProcessed ? "already" : "success");
      } catch {
        setStatus("error");
        setErrorMsg("An unexpected error occurred. Please contact support.");
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        {status === "verifying" && (
          <div className="rounded-lg bg-card p-8 shadow-md border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg className="h-8 w-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Verifying Your Payment...
            </h1>
            <p className="text-muted-foreground">
              Please wait while we confirm your purchase. This should only take a moment.
            </p>
          </div>
        )}

        {(status === "success" || status === "already") && (
          <div className="rounded-lg bg-card p-8 shadow-md border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--success))]/10">
              <svg className="h-8 w-8 text-[hsl(var(--success))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-display text-3xl font-semibold text-foreground mb-2">
              {status === "already" ? "Your Access Is Ready" : "Your Access Is Ready"}
            </h1>
            <p className="text-muted-foreground mb-2">
              {status === "already"
                ? "Your course access is already active, and you can sign in any time."
                : "Your payment was confirmed and course access has been granted automatically."}
            </p>
            {email && emailSent && (
              <p className="text-muted-foreground mb-6">
                A sign-in link has been sent to{" "}
                <strong className="text-foreground">{email}</strong>. Check your
                inbox and spam folder, then open your dashboard.
              </p>
            )}
            {email && !emailSent && accessGranted && (
              <p className="text-muted-foreground mb-6">
                Your access is active for <strong className="text-foreground">{email}</strong>, but we could not confirm email delivery. Open the login page and request a fresh sign-in link using that same email.
              </p>
            )}
            <div className="space-y-3">
              <Button variant="cta" size="lg" className="w-full" asChild>
                <Link to={user ? "/portal" : "/login"}>
                  {user ? "Go to Dashboard" : "Open Login Page"}
                </Link>
              </Button>
              {!user && (
                <Button variant="outline" size="lg" className="w-full" asChild>
                  <Link to="/login">Request Fresh Login Link</Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {user
                  ? "Your session is already active."
                  : emailSent
                    ? "Use the same email you used at checkout."
                    : "If the welcome email did not arrive, the login page will send a new one."}
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg bg-card p-8 shadow-md border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              We Couldn&apos;t Confirm Your Payment Yet
            </h1>
            <p className="text-muted-foreground mb-6">{errorMsg}</p>
            <div className="space-y-3">
              <Button variant="cta" size="lg" className="w-full" asChild>
                <Link to="/login">Try Signing In</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full" asChild>
                <Link to="/">Back to Home</Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                If you completed payment, your access may already be active.
                Try signing in with the email you used at checkout.
              </p>
              <a
                href="mailto:donovinsims@gmail.com"
                className="inline-block text-sm text-primary underline hover:text-primary/80 transition-colors"
              >
                Contact Support
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Success;
