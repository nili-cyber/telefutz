import { useEffect, useRef } from "react";

// Safari plays .m3u8 natively; every other browser needs hls.js to demux the
// stream into something <video> understands. Loaded lazily so native builds
// never pull in a web-only dependency.
export default function VideoPlayer({
  manifestUrl,
  onProgress,
}: {
  manifestUrl: string;
  onProgress: (seconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const canPlayNativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    let hls: any;

    if (canPlayNativeHls) {
      video.src = manifestUrl;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(manifestUrl);
          hls.attachMedia(video);
        }
      });
    }

    return () => hls?.destroy();
  }, [manifestUrl]);

  return (
    <video
      ref={videoRef}
      controls
      style={{ width: "100%", height: "100%" }}
      onTimeUpdate={(e) => onProgress(Math.floor(e.currentTarget.currentTime))}
    />
  );
}
