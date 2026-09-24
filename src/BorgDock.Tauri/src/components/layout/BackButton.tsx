import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/shared/primitives';
import { popView } from '@/services/navigation';

/**
 * BackButton — pops the main window's view stack. Detail views put it at the
 * start of their header; `Esc`, `Alt+Left` and the mouse back button do the
 * same thing (see ViewStack).
 */
export function BackButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      leading={<ArrowLeft size={14} aria-hidden />}
      onClick={() => void popView()}
      aria-keyshortcuts="Escape Alt+ArrowLeft"
    >
      Back
    </Button>
  );
}
