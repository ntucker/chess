// What React Native Web adds to Pressable, which React Native's types leave out.
// (Silk's Pressable passes `hovered` to style functions itself.)
import 'react-native';

declare module 'react-native' {
  interface PressableProps {
    /** Renders it as an anchor to this URL (web only). */
    readonly href?: string;
    /** The anchor's other attributes, such as `target` and `rel` (web only). */
    readonly hrefAttrs?: { readonly target?: string; readonly rel?: string };
  }
}
