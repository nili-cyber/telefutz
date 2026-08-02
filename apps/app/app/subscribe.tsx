import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { colors } from "../src/theme";
import { createStripeCheckoutSession, createPaypalSubscription } from "../src/api";

// Same redirect target for both providers - checkout-result.tsx reads
// `status` and `provider` (and `token`/orderId for PayPal) off the URL to
// decide what to do next. Web gets a real https URL; native gets the
// "telefutz://" scheme already registered in app.json.
function redirectUrls(provider: "stripe" | "paypal") {
  const base = Platform.OS === "web"
    ? `${window.location.origin}/checkout-result`
    : "telefutz://checkout-result";
  return {
    success: `${base}?status=success&provider=${provider}`,
    cancel: `${base}?status=cancel&provider=${provider}`,
  };
}

export default function SubscribeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<"stripe" | "paypal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function payWithStripe() {
    setError(null);
    setLoading("stripe");
    try {
      const { success, cancel } = redirectUrls("stripe");
      const { url } = await createStripeCheckoutSession(success, cancel);

      if (Platform.OS === "web") {
        window.location.href = url;
        return;
      }

      // Opens Stripe's hosted Checkout page in an in-app browser (Safari
      // View Controller / Chrome Custom Tab) - card, Apple Pay, and Google
      // Pay all work inside this, since it's a real browser context, not a
      // plain WebView. Resolves directly with the redirect URL once Stripe
      // sends the user back to telefutz://checkout-result.
      const result = await WebBrowser.openAuthSessionAsync(url, "telefutz://checkout-result");
      if (result.type === "success") {
        router.replace({ pathname: "/checkout-result", params: parseQuery(result.url) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  async function payWithPaypal() {
    setError(null);
    setLoading("paypal");
    try {
      const { success, cancel } = redirectUrls("paypal");
      const { approvalUrl } = await createPaypalSubscription(success, cancel);

      if (Platform.OS === "web") {
        window.location.href = approvalUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(approvalUrl, "telefutz://checkout-result");
      if (result.type === "success") {
        router.replace({ pathname: "/checkout-result", params: parseQuery(result.url) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>telefutz</Text>
      <Text style={styles.heading}>Subscribe to start watching</Text>
      <Text style={styles.body}>$12.99/month. Cancel anytime.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={payWithStripe} disabled={loading !== null}>
        {loading === "stripe" ? <ActivityIndicator color={colors.background} /> : (
          <Text style={styles.buttonText}>Pay with card, Apple Pay, or Google Pay</Text>
        )}
      </Pressable>

      <Pressable style={[styles.button, styles.paypalButton]} onPress={payWithPaypal} disabled={loading !== null}>
        {loading === "paypal" ? <ActivityIndicator color={colors.background} /> : (
          <Text style={styles.buttonText}>Pay with PayPal</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.switchText}>Not now</Text>
      </Pressable>
    </View>
  );
}

// Native's WebBrowser.openAuthSessionAsync resolves with the full redirect
// URL as a string - this pulls the query params back out of it so they can
// be handed to checkout-result.tsx the same way useLocalSearchParams would.
function parseQuery(url: string): Record<string, string> {
  const query = url.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(query));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 28 },
  wordmark: { fontSize: 24, fontStyle: "italic", color: colors.accent, marginBottom: 8, textAlign: "center" },
  heading: { fontSize: 20, fontWeight: "600", color: colors.text, marginBottom: 6, textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 14, marginBottom: 28, textAlign: "center" },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 14, alignItems: "center", marginBottom: 12 },
  paypalButton: { backgroundColor: "#FFC439" },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
  switchText: { color: colors.textMuted, textAlign: "center", marginTop: 14, fontSize: 13 },
  error: { color: colors.error, marginBottom: 14, fontSize: 13, textAlign: "center" },
});
