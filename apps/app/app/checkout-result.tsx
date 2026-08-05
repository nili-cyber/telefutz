import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "../src/theme";
import { confirmPaypalSubscription, getBillingStatus } from "../src/api";

export default function CheckoutResultScreen() {
  const router = useRouter();
  const { status, provider, subscription_id } = useLocalSearchParams<{
    status?: string;
    provider?: string;
    subscription_id?: string; // PayPal appends this to the return_url on approval
  }>();
  const [message, setMessage] = useState("Confirming your payment...");
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (status === "cancel") {
        setMessage("Payment canceled.");
        setDone(true);
        return;
      }

      if (provider === "paypal" && subscription_id) {
        try {
          await confirmPaypalSubscription(subscription_id);
          setMessage("You're subscribed! Enjoy Telefutz.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Payment could not be confirmed.");
        }
        setDone(true);
        return;
      }

      // Stripe: the subscription is activated by the webhook asynchronously,
      // which usually lands within a second or two - poll briefly instead
      // of assuming it's already there the instant the browser redirects back.
      for (let attempt = 0; attempt < 5; attempt++) {
        const billing = await getBillingStatus();
        if (billing.active) {
          setMessage("You're subscribed! Enjoy Telefutz.");
          setDone(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      setMessage("Payment received - it's finishing setup, this can take a moment. Try opening a title in a bit.");
      setDone(true);
    })();
  }, [status, provider, subscription_id]);

  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>telefutz</Text>
      {!done && <ActivityIndicator color={colors.accent} style={{ marginBottom: 16 }} />}
      <Text style={styles.body}>{message}</Text>
      {done && (
        <Pressable style={styles.button} onPress={() => router.replace("/dashboard")}>
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 28 },
  wordmark: { fontSize: 24, fontStyle: "italic", color: colors.accent, marginBottom: 24 },
  body: { color: colors.text, fontSize: 15, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  button: { backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 28 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
});
