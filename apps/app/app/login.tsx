import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth-context";
import { requestPhoneOtp } from "../src/api";

type Method = "email" | "phone";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp, signInWithPhone } = useAuth();
  const [method, setMethod] = useState<Method>("email");

  // --- email/password state ---
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");

  // --- phone/OTP state ---
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [phoneDisplayName, setPhoneDisplayName] = useState("");
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password, displayName, signupPhone || undefined);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp() {
    setError(null);
    setLoading(true);
    try {
      const result = await requestPhoneOtp(phone);
      setOtpSent(true);
      // devOtpCode only exists outside production - see auth-service's
      // /phone/request-otp route. No real SMS provider is wired up in this
      // scaffold, so this is how the flow is testable end-to-end locally.
      if (result.devOtpCode) setDevOtpCode(result.devOtpCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setLoading(true);
    try {
      // If this phone is already linked to an account (its own, or one
      // originally created via email+phone at signup), that same account
      // logs in - this doesn't create a duplicate.
      await signInWithPhone(phone, code, phoneDisplayName || undefined);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setError(null);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.wordmark}>telefutz</Text>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, method === "email" && styles.tabActive]} onPress={() => switchMethod("email")}>
          <Text style={[styles.tabText, method === "email" && styles.tabTextActive]}>Email</Text>
        </Pressable>
        <Pressable style={[styles.tab, method === "phone" && styles.tabActive]} onPress={() => switchMethod("phone")}>
          <Text style={[styles.tabText, method === "phone" && styles.tabTextActive]}>Phone</Text>
        </Pressable>
      </View>

      {method === "email" ? (
        <>
          {mode === "signup" && (
            <>
              <TextInput style={styles.input} placeholder="Display name" placeholderTextColor={colors.textMuted} value={displayName} onChangeText={setDisplayName} />
              <TextInput style={styles.input} placeholder="Phone (optional - lets you also log in by phone)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" value={signupPhone} onChangeText={setSignupPhone} />
            </>
          )}
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.button} onPress={handleEmailSubmit} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</Text>
          </Pressable>

          {mode === "login" && (
            <Pressable onPress={() => router.push("/forgot-password")}>
              <Text style={styles.switchText}>Forgot password?</Text>
            </Pressable>
          )}

          <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")}>
            <Text style={styles.switchText}>
              {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {!otpSent ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable style={styles.button} onPress={handleRequestOtp} disabled={loading || !phone}>
                <Text style={styles.buttonText}>{loading ? "Sending..." : "Send code"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>Enter the 6-digit code sent to {phone}.</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <TextInput
                style={styles.input}
                placeholder="Display name (only needed the first time)"
                placeholderTextColor={colors.textMuted}
                value={phoneDisplayName}
                onChangeText={setPhoneDisplayName}
              />

              {devOtpCode && (
                <View style={styles.devBox}>
                  <Text style={styles.devLabel}>Dev mode - no SMS provider is configured yet:</Text>
                  <Text style={styles.devLink}>Code: {devOtpCode}</Text>
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable style={styles.button} onPress={handleVerifyOtp} disabled={loading || code.length !== 6}>
                <Text style={styles.buttonText}>{loading ? "Verifying..." : "Verify and sign in"}</Text>
              </Pressable>
              <Pressable onPress={() => { setOtpSent(false); setCode(""); setDevOtpCode(null); }}>
                <Text style={styles.switchText}>Use a different number</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 28 },
  wordmark: { fontSize: 28, fontStyle: "italic", color: colors.accent, marginBottom: 20, textAlign: "center" },
  tabs: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 20, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: colors.background },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 14, alignItems: "center", marginTop: 6 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
  switchText: { color: colors.textMuted, textAlign: "center", marginTop: 18, fontSize: 13 },
  body: { color: colors.textMuted, fontSize: 14, marginBottom: 14, lineHeight: 20 },
  error: { color: colors.error, marginBottom: 10, fontSize: 13 },
  devBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 14, marginBottom: 12 },
  devLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  devLink: { color: colors.accent, fontSize: 16, fontWeight: "700", letterSpacing: 1 },
});
