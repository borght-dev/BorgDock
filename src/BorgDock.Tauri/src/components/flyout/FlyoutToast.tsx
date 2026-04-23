import type { ToastPayload } from './flyout-mode';

export function FlyoutToast(_props: {
  queue: ToastPayload[];
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onExpire: () => void;
  onActionClick: (toast: ToastPayload, action: string, url?: string) => void;
}) {
  return <div data-testid="flyout-toast-placeholder" />;
}
