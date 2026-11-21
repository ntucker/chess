// The app starts here, once navigation runs in transitions (see
// runNavigationInTransitions). Expo Router's entry stays a `require` after the
// call: an `import` would be hoisted above it.
import { runNavigationInTransitions } from '@/components/navigation';

runNavigationInTransitions();
require('expo-router/entry');
