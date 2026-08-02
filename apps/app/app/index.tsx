import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ScrollView } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { colors } from "../src/theme";
import { getTitles, getGenres, getRecommendations, getBillingStatus, Title } from "../src/api";
import { useAuth } from "../src/auth-context";
import TitleCard from "../src/components/TitleCard";

export default function HomeScreen() {
  const router = useRouter();
  const { user, isReady, signOut } = useAuth();
  const [titles, setTitles] = useState<Title[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<Title[]>([]);
  const [subscribed, setSubscribed] = useState(true); // optimistic default, avoids a flash of the banner
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (genre: string | null) => {
    const [t, g, r, billing] = await Promise.all([
      getTitles(genre ?? undefined),
      getGenres(),
      getRecommendations(user?.id ?? "anonymous"),
      getBillingStatus(),
    ]);
    setTitles(t);
    setGenres(g);
    setRecommended(r);
    setSubscribed(billing.active);
  }, [user]);

  useEffect(() => {
    if (user) load(selectedGenre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedGenre]);

  async function onRefresh() {
    setRefreshing(true);
    await load(selectedGenre);
    setRefreshing(false);
  }

  if (!isReady) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={titles}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: "space-between" }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View>
          <View style={styles.topbar}>
            <Text style={styles.wordmark}>telefutz</Text>
            <View style={styles.topbarActions}>
              {user.role === "admin" && (
                <Pressable onPress={() => router.push("/admin/titles")}>
                  <Text style={styles.adminLink}>Manage catalog</Text>
                </Pressable>
              )}
              <Pressable onPress={signOut}><Text style={styles.signOut}>Sign out</Text></Pressable>
            </View>
          </View>

          {!subscribed && (
            <Pressable style={styles.banner} onPress={() => router.push("/subscribe")}>
              <View>
                <Text style={styles.bannerTitle}>Browsing is free - watching needs a subscription</Text>
                <Text style={styles.bannerBody}>$12.99/month. Card, Apple Pay, Google Pay, or PayPal.</Text>
              </View>
              <Text style={styles.bannerCta}>Subscribe</Text>
            </Pressable>
          )}

          {recommended.length > 0 && !selectedGenre && (
            <>
              <Text style={styles.sectionTitle}>Picked for you</Text>
              <View style={styles.row}>
                {recommended.slice(0, 4).map((t) => <TitleCard key={t.id} title={t} />)}
              </View>
            </>
          )}

          {genres.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <Pressable
                style={[styles.chip, selectedGenre === null && styles.chipActive]}
                onPress={() => setSelectedGenre(null)}
              >
                <Text style={[styles.chipText, selectedGenre === null && styles.chipTextActive]}>All</Text>
              </Pressable>
              {genres.map((genre) => (
                <Pressable
                  key={genre}
                  style={[styles.chip, selectedGenre === genre && styles.chipActive]}
                  onPress={() => setSelectedGenre(genre)}
                >
                  <Text style={[styles.chipText, selectedGenre === genre && styles.chipTextActive]}>{genre}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Text style={styles.sectionTitle}>{selectedGenre ?? "Browse everything"}</Text>
        </View>
      }
      renderItem={({ item }) => <TitleCard title={item} />}
      ListEmptyComponent={
        <Text style={styles.empty}>Nothing in this category yet.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 960, width: "100%", alignSelf: "center" },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  topbarActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  wordmark: { fontSize: 22, fontStyle: "italic", color: colors.accent },
  adminLink: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  signOut: { color: colors.textMuted, fontSize: 13 },
  sectionTitle: { fontSize: 17, fontStyle: "italic", color: colors.text, marginTop: 10, marginBottom: 12, textTransform: "capitalize" },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  chipRow: { marginTop: 4, marginBottom: 4 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: colors.background, fontWeight: "600" },
  banner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent,
    borderRadius: 8, padding: 14, marginBottom: 20,
  },
  bannerTitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  bannerBody: { color: colors.textMuted, fontSize: 12 },
  bannerCta: { color: colors.accent, fontWeight: "700", fontSize: 13, marginLeft: 12 },
});
