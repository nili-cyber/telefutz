import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { colors } from "../src/theme";
import { getFreeTitles, Title } from "../src/api";
import { useAuth } from "../src/auth-context";
import TitleCard from "../src/components/TitleCard";

// Public landing page - no login required. This is what a first-time
// visitor sees; the full browse/subscribe/admin experience lives at
// /dashboard, which this hands off to once someone's actually signed in.
export default function LandingScreen() {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFreeTitles().then((t) => {
      setTitles(t);
      setLoading(false);
    });
  }, []);

  if (!isReady) return null;
  // Already signed in and just landed on "/" (e.g. typed the bare domain
  // again) - send them straight to the real app instead of the pitch page.
  if (user) return <Redirect href="/dashboard" />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={titles}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: "space-between" }}
      ListHeaderComponent={
        <View>
          <View style={styles.nav}>
            <Text style={styles.wordmark}>telefutz</Text>
            <View style={styles.navRight}>
              <View style={styles.navTab}>
                <Text style={styles.navTabText}>Free Movies</Text>
              </View>
              <Pressable
                style={styles.loginButton}
                onPress={() => router.push({ pathname: "/login", params: { mode: "login" } })}
              >
                <Text style={styles.loginButtonText}>Login</Text>
              </Pressable>
              <Pressable
                style={styles.signupButton}
                onPress={() => router.push({ pathname: "/login", params: { mode: "signup" } })}
              >
                <Text style={styles.signupButtonText}>Sign up</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.heading}>Free Movies</Text>
          <Text style={styles.subheading}>
            Watch these free, no account needed. Sign up to unlock the full catalog.
          </Text>
        </View>
      }
      renderItem={({ item }) => <TitleCard title={item} />}
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>No free titles yet - check back soon.</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 960, width: "100%", alignSelf: "center" },

  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 12,
    marginBottom: 24,
  },
  wordmark: { fontSize: 22, fontStyle: "italic", color: colors.accent },
  navRight: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  navTab: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  navTabText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginButtonText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  signupButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  signupButtonText: { color: colors.background, fontSize: 13, fontWeight: "700" },

  heading: { fontSize: 22, fontStyle: "italic", color: colors.text, marginBottom: 6 },
  subheading: { fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 19 },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
});
