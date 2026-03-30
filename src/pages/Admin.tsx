import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ADMIN_EMAILS = ["sls25trading@gmail.com", "emaildonovin@gmail.com", "donovinsims@gmail.com"];

interface Customer {
  id: string;
  email: string;
  course_access: boolean;
  purchased_at: string | null;
}

const Admin = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [granting, setGranting] = useState<string | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    if (!loading && user && !isAdmin) navigate("/portal");
  }, [user, loading, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchCustomers();
  }, [isAdmin]);

  const fetchCustomers = async () => {
    setLoadingData(true);
    const { data, error } = await supabase.functions.invoke("grant-access", {
      body: { action: "list" },
    });
    if (error) {
      console.error(error);
      toast.error("Failed to load customers");
    } else {
      setCustomers(data?.customers ?? []);
    }
    setLoadingData(false);
  };

  const handleGrant = async (customerId: string, email: string) => {
    setGranting(customerId);
    const { data, error } = await supabase.functions.invoke("grant-access", {
      body: { action: "grant", customerId, email },
    });
    if (error || !data?.success) {
      toast.error(data?.error ?? "Failed to grant access");
    } else {
      toast.success(`Access granted & magic link sent to ${email}`);
      fetchCustomers();
    }
    setGranting(null);
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const pending = customers.filter((c) => !c.course_access);
  const active = customers.filter((c) => c.course_access);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <span className="font-display text-xl font-semibold text-foreground">Admin Panel</span>
        <Button variant="outline" size="sm" onClick={() => navigate("/portal")}>
          Back to Portal
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        {loadingData ? (
          <p className="text-muted-foreground text-center">Loading customers...</p>
        ) : (
          <>
            {/* Pending */}
            <section>
              <h2 className="font-display text-2xl font-semibold text-foreground mb-4">
                Pending Access ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <p className="text-muted-foreground">No pending customers.</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-card border border-border p-4"
                    >
                      <div>
                        <p className="text-foreground font-medium">{c.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {c.purchased_at
                            ? `Purchased ${new Date(c.purchased_at).toLocaleDateString()}`
                            : "No purchase date"}
                        </p>
                      </div>
                      <Button
                        variant="cta"
                        size="sm"
                        disabled={granting === c.id}
                        onClick={() => handleGrant(c.id, c.email)}
                      >
                        {granting === c.id ? "Granting..." : "Grant Access"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Active */}
            <section>
              <h2 className="font-display text-2xl font-semibold text-foreground mb-4">
                Active Customers ({active.length})
              </h2>
              {active.length === 0 ? (
                <p className="text-muted-foreground">No active customers yet.</p>
              ) : (
                <div className="space-y-3">
                  {active.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-card border border-border p-4"
                    >
                      <div>
                        <p className="text-foreground font-medium">{c.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {c.purchased_at
                            ? `Since ${new Date(c.purchased_at).toLocaleDateString()}`
                            : "Active"}
                        </p>
                      </div>
                      <span className="text-sm text-[hsl(var(--success))] font-medium">✓ Active</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Admin;
