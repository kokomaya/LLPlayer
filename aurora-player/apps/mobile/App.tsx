import { StyleSheet, Text, View } from 'react-native';

// Minimal root component to verify the toolchain end-to-end (Metro + native +
// JS) renders on device. Swap this for the real player once a MediaSource and
// SubtitleDocument are available, e.g.:
//
//   import { VideoScreen } from './src/ui/VideoScreen';
//   export default function App() {
//     return <VideoScreen media={media} document={document} />;
//   }
export default function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aurora Player</Text>
      <Text style={styles.subtitle}>Mobile shell is running 🎉</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0b0f',
    gap: 8,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '600' },
  subtitle: { color: '#8a8a99', fontSize: 15 },
});
