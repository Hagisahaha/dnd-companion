import { SafeAreaView } from 'react-native-safe-area-context';
import { DiceTray } from '../components/dice/DiceTray';
import { usePalette } from '../theme/colors';

export default function Home() {
  const c = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <DiceTray />
    </SafeAreaView>
  );
}
