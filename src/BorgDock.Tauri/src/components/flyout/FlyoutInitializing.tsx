import { SplashScreen } from '@/components/SplashScreen';

/** Rendered inside the flyout frame while init is still running. */
export function FlyoutInitializing() {
  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
    >
      <div
        className="w-[380px] overflow-hidden rounded-[14px] border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-strong-border)',
          boxShadow: 'var(--flyout-shadow)',
          height: 480,
        }}
      >
        <SplashScreen />
      </div>
    </div>
  );
}
