import { StyleSheet } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";

export default function VideoPlayer({
  manifestUrl,
  onProgress,
}: {
  manifestUrl: string;
  onProgress: (seconds: number) => void;
}) {
  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    onProgress(Math.floor(status.positionMillis / 1000));
  }

  return (
    <Video
      source={{ uri: manifestUrl }}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      style={StyleSheet.absoluteFill}
      onPlaybackStatusUpdate={onPlaybackStatusUpdate}
    />
  );
}
