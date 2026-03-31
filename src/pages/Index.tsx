import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VideoMeta {
  id: string;
  title: string;
  description: string;
  sort_order: number;
  module: string;
  summary: string;
}

const REGULAR_PRICE_START = new Date("2026-04-01T00:00:00-05:00");

const getCurrentOffer = () => {
  const earlyBirdActive = Date.now() < REGULAR_PRICE_START.getTime();

  return earlyBirdActive
    ? {
        priceType: "early_bird" as const,
        priceLabel: "$149",
        compareAtPrice: "$199",
        supportingText: "Limited time offer — price increases to $199 on April 1",
      }
    : {
        priceType: "regular" as const,
        priceLabel: "$199",
        compareAtPrice: null,
        supportingText: "Full course access is now live at the standard price.",
      };
};

const Index = () => {
  const [modules, setModules] = useState<Record<string, VideoMeta[]>>({});
  const [loadingCurriculum, setLoadingCurriculum] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const currentOffer = getCurrentOffer();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.rpc("get_course_videos");
      if (!error && data) {
        const grouped: Record<string, VideoMeta[]> = {};
        (data as VideoMeta[]).forEach((v) => {
          if (!grouped[v.module]) grouped[v.module] = [];
          grouped[v.module].push(v);
        });
        setModules(grouped);
      }
      setLoadingCurriculum(false);
    };
    load();
  }, []);

  const handleCheckout = async (priceType: "early_bird" | "regular" = currentOffer.priceType) => {
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceType },
      });

      if (error || !data?.url) {
        const message = "Checkout is unavailable right now. Please try again in a moment or contact support.";
        setCheckoutError(message);
        toast.error(message);
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      const message = "Checkout is unavailable right now. Please try again in a moment or contact support.";
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setCheckingOut(false);
    }
  };

  const moduleNames = Object.keys(modules);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between">
        <span className="font-display text-xl font-semibold text-foreground">SLS Trading</span>
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-16 md:py-24 text-center space-y-6">
        <p className="font-script text-primary text-2xl">Transform your trading</p>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
          Master Day Trading
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          24 comprehensive video lessons covering everything from market structure fundamentals to advanced strategies and trading psychology.
        </p>
        <div className="pt-4 space-y-3">
          <Button
            variant="cta"
            size="lg"
            className="text-lg px-10 py-6"
            disabled={checkingOut}
            onClick={() => handleCheckout()}
          >
            {checkingOut ? "Loading..." : `Get Instant Access — ${currentOffer.priceLabel}`}
          </Button>
          <p className="text-sm text-muted-foreground">
            {currentOffer.compareAtPrice ? (
              <>
                <span className="text-destructive font-medium">Limited time offer</span> — price increases to $199 on April 1
              </>
            ) : (
              currentOffer.supportingText
            )}
          </p>
          {checkoutError && (
            <p className="text-sm text-destructive">
              {checkoutError} <a className="underline" href="mailto:donovinsims@gmail.com">Contact support</a>.
            </p>
          )}
        </div>
      </section>

      {/* What You'll Learn */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-12">
          <p className="font-script text-primary text-xl mb-2">Curriculum</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
            What You'll Learn
          </h2>
        </div>
        {loadingCurriculum ? (
          <p className="text-center text-muted-foreground">Loading curriculum...</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {moduleNames.map((mod) => (
              <div
                key={mod}
                className="rounded-lg bg-card border border-border p-6 shadow-sm"
              >
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                  {mod}
                </h3>
                <ul className="space-y-2">
                  {modules[mod].map((video) => (
                    <li key={video.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span>
                      {video.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-lg bg-card border-2 border-primary p-8 md:p-12 shadow-md">
          <p className="font-script text-primary text-xl mb-2">One-time payment</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
            Full Course Access
          </h2>
          <div className="flex items-baseline justify-center gap-3 mb-2">
            <span className="text-4xl md:text-5xl font-display font-bold text-foreground">
              {currentOffer.priceLabel}
            </span>
            {currentOffer.compareAtPrice && (
              <span className="text-xl text-muted-foreground line-through">
                {currentOffer.compareAtPrice}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-6">{currentOffer.supportingText}</p>
          <ul className="text-left max-w-sm mx-auto space-y-3 mb-8">
            {[
              "24 comprehensive video lessons",
              "Beginner-friendly summaries & transcripts",
              "Lifetime access to all content",
              "6 modules from foundations to psychology",
              "Real trade walkthroughs & examples",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-muted-foreground">
                <svg className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
          <Button
            variant="cta"
            size="lg"
            className="text-lg px-10 py-6"
            disabled={checkingOut}
            onClick={() => handleCheckout()}
          >
            {checkingOut ? "Loading..." : "Get Instant Access"}
          </Button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center space-y-6">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
          Ready to Start?
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Join hundreds of traders who have transformed their approach to the markets.
        </p>
        <Button
          variant="cta"
          size="lg"
          className="text-lg px-10 py-6"
          disabled={checkingOut}
          onClick={() => handleCheckout()}
        >
          {checkingOut ? "Loading..." : `Get Instant Access — ${currentOffer.priceLabel}`}
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground space-y-2">
        <div className="flex justify-center gap-4">
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Purchase</Link>
          <span>·</span>
          <Link to="/disclaimer" className="hover:text-foreground transition-colors">Disclaimer</Link>
        </div>
        <p>© {new Date().getFullYear()} SLS Trading. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Index;
