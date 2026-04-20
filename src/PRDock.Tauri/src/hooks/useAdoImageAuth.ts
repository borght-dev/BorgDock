import { invoke } from '@tauri-apps/api/core';
import { type RefObject, useEffect, useRef } from 'react';
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

    const ado = useSettingsStore.getState().settings.azureDevOps;
    if (!ado.organization) return;

    let cancelled = false;

    (async () => {
      let authHeader: string;
      try {
        authHeader = await invoke<string>('ado_resolve_auth_header', {
          authMethod: ado.authMethod,
          pat: ado.authMethod === 'pat' ? (ado.personalAccessToken ?? '') : null,
        });
      } catch {
        return;
      }

      if (cancelled) return;

      const imgs = el.querySelectorAll<HTMLImageElement>('img');

      for (const img of imgs) {
        const src = img.getAttribute('src') ?? '';
        // All images in ADO HTML content require auth — skip only data: URIs and blob: URIs
        if (!src.startsWith('http')) continue;

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
    })();

    return () => {
      cancelled = true;
      for (const url of blobUrls.current) {
        URL.revokeObjectURL(url);
      }
      blobUrls.current = [];
    };
  }, [containerRef, htmlContent]);
}
