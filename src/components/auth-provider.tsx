"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CFUser {
  email: string;
  name: string;
  sub: string;
  groups: string[];
  isAuthenticated: boolean;
}

interface AuthContextType {
  user: CFUser;
  isLoading: boolean;
  logout: () => void;
}

const defaultUser: CFUser = {
  email: '',
  name: '',
  sub: '',
  groups: [],
  isAuthenticated: false,
};

const AuthContext = createContext<AuthContextType>({
  user: defaultUser,
  isLoading: true,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: CFUser;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<CFUser>(initialUser || defaultUser);
  const [isLoading, setIsLoading] = useState(!initialUser);

  useEffect(() => {
    if (initialUser) {
      setIsLoading(false);
      return;
    }

    // Fetch user from API if not provided
    fetch('/api/auth/user')
      .then(res => res.json())
      .then(data => {
        setUser(data.user || defaultUser);
      })
      .catch(() => {
        setUser(defaultUser);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [initialUser]);

  const logout = () => {
    // Clear cookies and redirect to home
    document.cookie = 'CF_Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.clawpanel.app;';
    window.location.href = 'https://clawpanel.app';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
