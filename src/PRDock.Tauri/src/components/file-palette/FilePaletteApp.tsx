import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback } from 'react';

export function FilePaletteApp() {
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <div className="fp-placeholder">File palette — coming online</div>
      </div>
    </div>
  );
}
