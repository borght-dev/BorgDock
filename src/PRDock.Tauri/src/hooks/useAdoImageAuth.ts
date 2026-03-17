import { useEffect, useRef, type RefObject } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Post-render hook that finds <img> elements pointing to dev.azure.com
 * inside the given container, fetches them with the ADO PAT auth header,
 * and replaces the src with a blob URL so the images actually render.
 */
export function useAdoImageAuth(containerRef: RefObject<HTMLElement | null>, htmlContent?: string) {
  const blobUrls = useRef<string[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !htmlContent) return;

    const pat = useSettingsStore.getState().settings.azureDevOps.personalAccessToken;
    if (!pat) return;

    const authHeader = 'Basic ' + btoa(':' + pat);
    const imgs = el.querySelectorAll<HTMLImageElement>('img');
    let cancelled = false;

    for (const img of imgs) {
      const src = img.getAttribute('src') ?? '';
      if (!src.includes('dev.azure.com') && !src.includes('visualstudio.com')) continue;

      // Hide broken image while loading
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.2s';

      fetch(src, { headers: { Authorization: authHeader } })
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
          img.src = url;
          img.style.opacity = '1';
        })
        .catch(() => {
          if (cancelled) return;
          img.style.opacity = '1'; // show broken state
        });
    }

    return () => {
      cancelled = true;
      for (const url of blobUrls.current) {
        URL.revokeObjectURL(url);
      }
      blobUrls.current = [];
    };
  }, [containerRef, htmlContent]);
}
