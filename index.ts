// The app starts here. Expo Router reads its transition mode once, on its
// first render, so the mode is set before Expo Router's entry runs. The entry
// stays a `require` after the call: an `import` would be hoisted above it.
import { runNavigationInTransitions } from '@/components/navigation';

runNavigationInTransitions();
require('expo-router/entry');
