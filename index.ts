// The app's entry. Expo Router reads its transition mode once, on its first
// render, so navigation is set to run in transitions before its entry loads
// (see runNavigationInTransitions). Its entry stays a `require` after the
// call: an `import` would be hoisted above it.
import { runNavigationInTransitions } from '@/components/navigation';

runNavigationInTransitions();
require('expo-router/entry');
