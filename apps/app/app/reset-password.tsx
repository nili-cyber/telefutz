import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors } from "../src/theme";
import { resetPassword } from "../src/api";

export default function ResetPasswordScreen() {
  const router = useRouter();
  // Populated automatically when opened from a reset link (web query param
  // or a telefutz:// deep link on mobile) - editable in case someone pastes
  // a token in manually instead.
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(tokenParam ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={styles.screen}>
        <Text style={styles.wordmark}>telefutz</Text>
        <Text style={styles.body}>Your password has been updated.</Text>
        <Pressable style={styles.button} onPress={() => router.replace("/login")}>
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.wordmark}>telefutz</Text>
      <Text style={styles.heading}>Choose a new password</Text>

      <TextInput
        style={styles.input}
        placeholder="Reset token"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        value={token}
        onChangeText={setToken}
      />
      <TextInput
        style={styles.input}
        placeholder="New password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={loading || !token || newPassword.length < 8}>
        <Text style={styles.buttonText}>{loading ? "Updating..." : "Update password"}</Text>
      </Pressable>

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
  body: { color: colors.textMuted, fontSize: 14, marginBottom: 20, textAlign: "center", lineHeight: 20 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 14, alignItems: "center", marginTop: 6 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
  switchText: { color: colors.textMuted, textAlign: "center", marginTop: 22, fontSize: 13 },
  error: { color: colors.error, marginBottom: 10, fontSize: 13 },
});
