import { Pressable, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import type { Title } from "../api";

export default function TitleCard({ title }: { title: Title }) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/watch/${title.id}`)}>
      <View style={styles.poster}>
        <Text style={styles.posterText} numberOfLines={3}>{title.name}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>{title.name}</Text>
      <Text style={styles.sub}>{title.genre} · {title.releaseYear}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: "48%", marginBottom: 18 },
  poster: {
    aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
    justifyContent: "center", padding: 10, marginBottom: 6,
  },
  posterText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  title: { color: colors.text, fontSize: 14, fontWeight: "500" },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
