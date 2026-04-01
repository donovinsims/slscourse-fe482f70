import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AuthCallback = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate(user ? "/portal" : "/login", { replace: true });
  }, [loading, navigate, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-3">
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Signing You In
        </h1>
        <p className="text-muted-foreground">
          Please wait while we finish your secure sign-in.
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
