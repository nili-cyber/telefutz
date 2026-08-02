import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { colors } from "../../src/theme";
import { getTitle, getManifestUrl, reportProgress, getBillingStatus, Title } from "../../src/api";
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
    if (!id || !user) return;
    (async () => {
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
  }, [id, user]);

  function onProgress(seconds: number) {
    if (!user || seconds - lastReported.current < 5) return;
    lastReported.current = seconds;
    reportProgress(id, user.id, seconds).catch(() => {});
  }

  if (!isReady) return null;
  if (!user) return <Redirect href="/login" />;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!title) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Title not found.</Text>
      </View>
    );
  }

  if (subscribed === false) {
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
