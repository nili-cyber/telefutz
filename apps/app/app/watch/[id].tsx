import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "../../src/theme";
import { getTitle, getManifestUrl, reportProgress, getBillingStatus, getFreeTitles, getFreeManifestUrl, Title } from "../../src/api";
import { useAuth } from "../../src/auth-context";
import VideoPlayer from "../../src/components/VideoPlayer";

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isReady } = useAuth();
  const [title, setTitle] = useState<Title | null>(null);
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const lastReported = useRef(0);

  useEffect(() => {
    if (!id || !isReady) return;
    (async () => {
      if (!user) {
        // Not signed in - only free titles work here. There's no public
        // single-title lookup, so match against the same free list the
        // landing page shows; if it's not in there, either the title
        // doesn't exist or it just isn't free - either way, the person
        // needs to sign in to find out which.
        const freeTitles = await getFreeTitles();
        const match = freeTitles.find((t) => t.id === id);
        if (match) {
          setTitle(match);
          const url = await getFreeManifestUrl(id);
          setManifestUrl(url);
        }
        setLoading(false);
        return;
      }

      // Check subscription status before requesting a manifest URL at all -
      // this is a UX shortcut, not the real enforcement. The gateway itself
      // rejects /api/playback with a 402 for unpaid accounts regardless of
      // what this screen does, so there's no way to bypass it by skipping
      // this check client-side.
      const billing = await getBillingStatus();
      setSubscribed(billing.active);

      if (billing.active) {
        const [t, url] = await Promise.all([getTitle(id), getManifestUrl(id)]);
        setTitle(t);
        setManifestUrl(url);
      } else {
        const t = await getTitle(id);
        setTitle(t);
      }
      setLoading(false);
    })();
  }, [id, user, isReady]);

  function onProgress(seconds: number) {
    if (!user || seconds - lastReported.current < 5) return;
    lastReported.current = seconds;
    reportProgress(id, user.id, seconds).catch(() => {});
  }

  if (!isReady || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!title) {
    return (
      <View style={styles.center}>
        {user ? (
          <Text style={styles.muted}>Title not found.</Text>
        ) : (
          <>
            <Text style={[styles.muted, { marginBottom: 20 }]}>
              Sign in to watch this - or it might not exist.
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => router.push({ pathname: "/login", params: { mode: "login" } })}
            >
              <Text style={styles.buttonText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (user && subscribed === false) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{title.name}</Text>
        <Text style={[styles.muted, { marginBottom: 20 }]}>
          An active subscription is required to watch this.
        </Text>
        <Pressable style={styles.button} onPress={() => router.push("/subscribe")}>
          <Text style={styles.buttonText}>Subscribe to watch</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.player}>
        {manifestUrl ? (
          <VideoPlayer manifestUrl={manifestUrl} onProgress={onProgress} />
        ) : (
          <Text style={styles.muted}>No manifest URL - is playback-service reachable?</Text>
        )}
      </View>
      <Text style={styles.title}>{title.name}</Text>
      <Text style={styles.description}>{title.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 20, maxWidth: 960, width: "100%", alignSelf: "center" },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28 },
  player: { aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 6, alignItems: "center", justifyContent: "center", marginBottom: 16, overflow: "hidden" },
  title: { color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 8, textAlign: "center" },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 13, textAlign: "center", padding: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 15 },
});
