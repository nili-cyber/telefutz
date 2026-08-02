import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../src/theme";
import { requestPasswordReset } from "../src/api";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setSent(true);
      // devResetToken only exists outside production - see auth-service's
      // /forgot-password route. There's no real email provider in this
      // scaffold, so this is how you test the flow end-to-end locally.
      if (result.devResetToken) setDevToken(result.devResetToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.wordmark}>telefutz</Text>
      <Text style={styles.heading}>Reset your password</Text>

      {!sent ? (
        <>
          <Text style={styles.body}>Enter your account email and we'll send you a reset link.</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.button} onPress={handleSubmit} disabled={loading || !email}>
            <Text style={styles.buttonText}>{loading ? "Sending..." : "Send reset link"}</Text>
          </Pressable>
        </>
      ) : (
        <View>
          <Text style={styles.body}>
            If that email is registered, we've sent instructions to reset your password.
          </Text>

          {devToken && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>Dev mode - no email provider is configured yet:</Text>
              <Pressable onPress={() => router.push({ pathname: "/reset-password", params: { token: devToken } })}>
                <Text style={styles.devLink}>Continue to reset password</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <Pressable onPress={() => router.replace("/login")}>
        <Text style={styles.switchText}>Back to sign in</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 28 },
  wordmark: { fontSize: 24, fontStyle: "italic", color: colors.accent, marginBottom: 8, textAlign: "center" },
  heading: { fontSize: 18, color: colors.text, marginBottom: 16, textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 14, alignItems: "center", marginTop: 6 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
  switchText: { color: colors.textMuted, textAlign: "center", marginTop: 22, fontSize: 13 },
  error: { color: colors.error, marginBottom: 10, fontSize: 13 },
  devBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 14, marginTop: 4 },
  devLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  devLink: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
