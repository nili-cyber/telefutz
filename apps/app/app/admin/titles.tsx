import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Alert } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { colors } from "../../src/theme";
import { useAuth } from "../../src/auth-context";
import { getTitles, createTitle, deleteTitle, Title } from "../../src/api";

const emptyForm = { name: "", description: "", genre: "", releaseYear: "", posterUrl: "", videoId: "" };

export default function AdminTitlesScreen() {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const [titles, setTitles] = useState<Title[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTitles(await getTitles());
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  if (!isReady) return null;
  if (!user) return <Redirect href="/login" />;
  // Client-side gate is just UX - api-gateway's requireAdmin is what
  // actually stops a non-admin from calling the write endpoints directly.
  if (user.role !== "admin") return <Redirect href="/" />;

  async function handleAdd() {
    setError(null);
    const releaseYear = Number(form.releaseYear);
    if (!form.name || !form.genre || !releaseYear) {
      setError("Name, genre, and a valid release year are required");
      return;
    }
    setSaving(true);
    try {
      await createTitle({
        name: form.name,
        description: form.description,
        genre: form.genre,
        releaseYear,
        posterUrl: form.posterUrl || "/posters/placeholder.jpg",
        videoId: form.videoId || form.name.toLowerCase().replace(/\s+/g, "-"),
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add title");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(title: Title) {
    Alert.alert("Remove title", `Remove "${title.name}" from the catalog?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteTitle(title.id);
          await load();
        },
      },
    ]);
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={titles}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={styles.topbar}>
            <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
            <Text style={styles.heading}>Manage catalog</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Add a title</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={colors.textMuted} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
            <View style={styles.formRow}>
              <TextInput style={[styles.input, styles.half]} placeholder="Genre" placeholderTextColor={colors.textMuted} value={form.genre} onChangeText={(v) => setForm({ ...form, genre: v })} />
              <TextInput style={[styles.input, styles.half]} placeholder="Release year" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={form.releaseYear} onChangeText={(v) => setForm({ ...form, releaseYear: v })} />
            </View>
            <TextInput style={styles.input} placeholder="Poster URL (optional)" placeholderTextColor={colors.textMuted} value={form.posterUrl} onChangeText={(v) => setForm({ ...form, posterUrl: v })} />
            <TextInput style={styles.input} placeholder="Video ID (optional - used by playback-service)" placeholderTextColor={colors.textMuted} value={form.videoId} onChangeText={(v) => setForm({ ...form, videoId: v })} />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.button} onPress={handleAdd} disabled={saving}>
              <Text style={styles.buttonText}>{saving ? "Adding..." : "Add title"}</Text>
            </Pressable>
          </View>

          <Text style={styles.formTitle}>Existing titles ({titles.length})</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowSub}>{item.genre} · {item.releaseYear}</Text>
          </View>
          <Pressable onPress={() => handleDelete(item)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60, maxWidth: 720, width: "100%", alignSelf: "center" },
  topbar: { marginBottom: 20 },
  back: { color: colors.accent, fontSize: 13, marginBottom: 12 },
  heading: { color: colors.text, fontSize: 20, fontWeight: "600" },
  form: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 28 },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: "600", marginBottom: 12 },
  formRow: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, marginBottom: 10, fontSize: 14 },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 12, alignItems: "center", marginTop: 4 },
  buttonText: { color: colors.background, fontWeight: "600", fontSize: 14 },
  error: { color: colors.error, fontSize: 13, marginBottom: 10 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  remove: { color: colors.error, fontSize: 13, fontWeight: "600" },
});
