"use client";

import { useAuth } from "./auth-provider";
import { User, LogOut } from "lucide-react";

export function UserMenu() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-400 rounded-full border border-white/10 bg-white/5">
        <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
        <span>Auth…</span>
      </div>
    );
  }

  if (!user.isAuthenticated) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-400 rounded-full border border-white/10 bg-white/5">
        <User className="w-3.5 h-3.5" />
        <span>Guest</span>
      </div>
    );
  }

  const label = user.name || user.email.split('@')[0];

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] font-medium text-emerald-300 max-w-[90px] truncate">{label}</span>
      </div>

      <button
        onClick={logout}
        className="w-7 h-7 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors"
        title="Logout"
        aria-label="Logout"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
