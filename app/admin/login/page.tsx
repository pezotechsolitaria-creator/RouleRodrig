"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <span className="font-syne font-extrabold text-2xl text-offwhite uppercase tracking-tight">
              ROULE
            </span>
            <span className="w-px h-5 bg-dark-border" />
            <span className="font-bebas text-lg tracking-[0.25em] text-yellow">RODRIGUES</span>
            <span className="w-2 h-2 rounded-full bg-yellow" />
          </div>
          <p className="font-bebas text-muted text-xs tracking-[0.35em]">ADMIN DASHBOARD</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-dark-card border border-dark-border rounded-2xl p-8 space-y-5"
        >
          <h1 className="font-syne font-bold text-offwhite text-xl">Sign in</h1>

          <div>
            <label
              htmlFor="password"
              className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2"
            >
              PASSWORD
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
                className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3.5 pr-11 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-offwhite transition-colors"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm font-dm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm py-3.5 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : <><LogIn size={16} /> Sign In</>}
          </button>
        </form>

      </div>
    </div>
  );
}
