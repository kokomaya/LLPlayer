import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import type { MediaSource } from '@aurora/player-api';
import { VideoScreen } from './src/ui/VideoScreen';

// --- Demo content -----------------------------------------------------------
//
// Demo clip: the Sintel trailer (~52s, H.264). Because this machine sits behind
// a corporate proxy the Android emulator can't reach, the file is played from
// the app's own PRIVATE on-device storage instead of streamed.
//
// It MUST live in the app's internal dir (/data/data/<pkg>/files), NOT in
// /sdcard/Android/data/<pkg>/... — a file adb-pushed to the sdcard path is owned
// by the `shell` user and Android's scoped-storage FUSE layer then denies the
// app itself read access (EACCES). Copy it in AS THE APP with run-as (debug
// builds only):
//   adb push .demo-assets/sintel.mp4 /data/local/tmp/sintel.mp4
//   adb shell "run-as com.anonymous.auroramobile cp /data/local/tmp/sintel.mp4 files/sintel.mp4"
//   adb shell rm /data/local/tmp/sintel.mp4
// To stream instead (on a network the device CAN reach), swap `uri` for
// 'https://media.w3.org/2010/05/sintel/trailer.mp4'.
const DEMO_MEDIA: MediaSource = {
  id: 'demo-sintel',
  uri: 'file:///data/data/com.anonymous.auroramobile/files/sintel.mp4',
  title: 'Sintel trailer (demo)',
  durationMs: 52_000,
};

// Inline subtitle track, parsed at runtime by the real @aurora/subtitle parser
// into a SubtitleDocument (same code path as the CLI). Timings are spread across
// the ~52s demo clip above.
const DEMO_SRT = `1
00:00:02,000 --> 00:00:06,000
Welcome to Aurora Player

2
00:00:07,000 --> 00:00:12,000
This is a demo subtitle track

3
00:00:14,000 --> 00:00:19,000
Words highlight as the video plays

4
00:00:22,000 --> 00:00:27,000
Try a WhisperX JSON for word-level sync

5
00:00:30,000 --> 00:00:36,000
Seeking jumps both video and subtitle

6
00:00:40,000 --> 00:00:46,000
Enjoy learning with subtitles!
`;

export default function App(): React.JSX.Element {
  const parsed = useMemo(
    () =>
      createDefaultRegistry().parse({
        content: DEMO_SRT,
        filename: 'demo.srt',
      }),
    [],
  );

  if (!parsed.ok) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Aurora Player</Text>
        <Text style={styles.error}>
          Failed to parse demo subtitles: {parsed.error.message}
        </Text>
      </View>
    );
  }

  const document: SubtitleDocument = parsed.value;
  return <VideoScreen media={DEMO_MEDIA} document={document} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0b0f',
    gap: 8,
    padding: 24,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '600' },
  error: { color: '#ff6b6b', fontSize: 15, textAlign: 'center' },
});
