import { SplashScreen } from '@/components/SplashScreen';
import { Card } from '@/components/shared/primitives';

/** Rendered inside the flyout frame while init is still running. */
export function FlyoutInitializing() {
  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      // style: transparent background required for Tauri transparent-window overlay; padding in px avoids Tailwind rounding
      style={{ background: 'transparent', padding: 16 }}
    >
      <Card
        padding="md"
        className="w-[380px] overflow-hidden rounded-[14px]"
        // style: flyout-shadow custom property + fixed pixel height — no Tailwind utilities for these
        style={{
          boxShadow: 'var(--flyout-shadow)',
          height: 480,
        }}
      >
        <SplashScreen />
      </Card>
    </div>
  );
}
