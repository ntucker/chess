import { useScreenKeys } from '@/components/useScreenKeys';

/**
 * On the web, the arrow keys step through the moves (Home and End jump to
 * the first and latest), while this screen is in front.
 */
export function useStepKeys(ply: number, total: number, goto: (ply: number) => void) {
  useScreenKeys((event) => {
    const targets: Record<string, number> = {
      ArrowLeft: ply - 1,
      ArrowRight: ply + 1,
      Home: 0,
      End: total,
    };
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      goto(targets[event.key]);
    }
  });
}
