import Constants from "expo-constants";
import { getItem, setItem, removeItem } from "./storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "http://localhost:8080";
const TOKEN_KEY = "telefutz_token";

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Title = {
  id: string;
  name: string;
  description: string;
  genre: string;
  releaseYear: number;
  posterUrl: string;
};

export async function signup(email: string, password: string, displayName: string, phone?: string) {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Signup failed");
  return data as { token: string; user: { id: string; email: string | null; phone: string | null; displayName: string; role: string } };
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as { token: string; user: { id: string; email: string | null; phone: string | null; displayName: string; role: string } };
}

export async function requestPhoneOtp(phone: string): Promise<{ message: string; devOtpCode?: string }> {
  const res = await fetch(`${API_URL}/api/auth/phone/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// Resolves to the same account every time this phone number verifies,
// whether it was linked at signup or this is the first time it's been used.
export async function verifyPhoneOtp(phone: string, code: string, displayName?: string) {
  const res = await fetch(`${API_URL}/api/auth/phone/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Verification failed");
  return data as { token: string; user: { id: string; email: string | null; phone: string | null; displayName: string; role: string } };
}

export async function getTitles(genre?: string): Promise<Title[]> {
  const query = genre ? `?genre=${encodeURIComponent(genre)}` : "";
  const res = await fetch(`${API_URL}/api/catalog/titles${query}`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function getGenres(): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/catalog/genres`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export type TitleInput = Omit<Title, "id">;

export async function createTitle(input: TitleInput): Promise<Title> {
  const res = await fetch(`${API_URL}/api/catalog/titles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : "Could not create title");
  return data;
}

export async function updateTitle(id: string, input: Partial<TitleInput>): Promise<Title> {
  const res = await fetch(`${API_URL}/api/catalog/titles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : "Could not update title");
  return data;
}

export async function deleteTitle(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/catalog/titles/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Could not delete title");
}

export async function getTitle(id: string): Promise<Title | null> {
  const res = await fetch(`${API_URL}/api/catalog/titles/${id}`, { headers: await authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function getRecommendations(userId: string): Promise<Title[]> {
  const res = await fetch(`${API_URL}/api/recommendations?userId=${userId}`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function getManifestUrl(titleId: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/playback/${titleId}/manifest-url`, { headers: await authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.manifestUrl;
}

export async function requestPasswordReset(email: string): Promise<{ message: string; devResetToken?: string }> {
  const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Reset failed");
  return data;
}

export async function reportProgress(titleId: string, userId: string, positionSeconds: number) {
  await fetch(`${API_URL}/api/playback/${titleId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ userId, positionSeconds }),
  });
}

export type BillingStatus = {
  active: boolean;
  status: string;
  provider: "stripe" | "paypal" | null;
  currentPeriodEnd: string | null;
};

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await fetch(`${API_URL}/api/billing/status`, { headers: await authHeaders() });
  if (!res.ok) return { active: false, status: "inactive", provider: null, currentPeriodEnd: null };
  return res.json();
}

// One Stripe Checkout session covers card, Apple Pay, and Google Pay - the
// hosted page shows whichever wallet the visiting device supports.
export async function createStripeCheckoutSession(successUrl: string, cancelUrl: string): Promise<{ url: string }> {
  const res = await fetch(`${API_URL}/api/billing/stripe/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ successUrl, cancelUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
  return data;
}

export async function createPaypalSubscription(returnUrl: string, cancelUrl: string): Promise<{ subscriptionId: string; approvalUrl: string }> {
  const res = await fetch(`${API_URL}/api/billing/paypal/create-subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ returnUrl, cancelUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start PayPal checkout");
  return data;
}

// Fast-path confirmation right after the redirect back from PayPal's
// approval page - the webhook (server-side) is still the source of truth
// for renewals and cancellations after this point.
export async function confirmPaypalSubscription(subscriptionId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/billing/paypal/confirm-subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ subscriptionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Subscription could not be confirmed");
  return data;
}
