import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  getToken,
  setToken,
  clearToken,
  login as apiLogin,
  signup as apiSignup,
  verifyPhoneOtp,
} from "./api";

type User = { id: string; email: string | null; phone: string | null; displayName: string; role: string };

type AuthContextValue = {
  user: User | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, phone?: string) => Promise<void>;
  // Verifies an OTP already requested via requestPhoneOtp() in api.ts.
  // Resolves to the existing account if this phone is already linked to
  // one, or creates a new account on first use - same underlying flow
  // either way, so the caller doesn't need to know which happened.
  signInWithPhone: (phone: string, code: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Production version: validate the stored token against GET /me and
    // clear it if expired, instead of just checking presence.
    getToken().then(() => setIsReady(true));
  }, []);

  async function signIn(email: string, password: string) {
    const result = await apiLogin(email, password);
    await setToken(result.token);
    setUser(result.user);
  }

  async function signUp(email: string, password: string, displayName: string, phone?: string) {
    const result = await apiSignup(email, password, displayName, phone);
    await setToken(result.token);
    setUser(result.user);
  }

  async function signInWithPhone(phone: string, code: string, displayName?: string) {
    const result = await verifyPhoneOtp(phone, code, displayName);
    await setToken(result.token);
    setUser(result.user);
  }

  async function signOut() {
    await clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isReady, signIn, signUp, signInWithPhone, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
