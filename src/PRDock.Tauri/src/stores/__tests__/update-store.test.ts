import { beforeEach, describe, expect, it } from 'vitest';
import { useUpdateStore } from '../update-store';

describe('update-store', () => {
  beforeEach(() => {
    useUpdateStore.setState({
      available: false,
      version: null,
      downloading: false,
      progress: 0,
      checking: false,
      statusText: '',
      currentVersion: '',
    });
  });

  describe('initial state', () => {
    it('starts with no update available', () => {
      const s = useUpdateStore.getState();
      expect(s.available).toBe(false);
      expect(s.version).toBeNull();
      expect(s.downloading).toBe(false);
      expect(s.progress).toBe(0);
      expect(s.checking).toBe(false);
      expect(s.statusText).toBe('');
      expect(s.currentVersion).toBe('');
    });
  });

  describe('setAvailable', () => {
    it('marks update as available with version', () => {
      useUpdateStore.getState().setAvailable('2.0.0');
      const s = useUpdateStore.getState();
      expect(s.available).toBe(true);
      expect(s.version).toBe('2.0.0');
    });
  });

  describe('setDownloading', () => {
    it('sets downloading to true', () => {
      useUpdateStore.getState().setDownloading(true);
      expect(useUpdateStore.getState().downloading).toBe(true);
    });

    it('sets downloading to false', () => {
      useUpdateStore.getState().setDownloading(true);
      useUpdateStore.getState().setDownloading(false);
      expect(useUpdateStore.getState().downloading).toBe(false);
    });
  });

  describe('setProgress', () => {
    it('sets download progress', () => {
      useUpdateStore.getState().setProgress(50);
      expect(useUpdateStore.getState().progress).toBe(50);
    });

    it('can set progress to 0', () => {
      useUpdateStore.getState().setProgress(50);
      useUpdateStore.getState().setProgress(0);
      expect(useUpdateStore.getState().progress).toBe(0);
    });

    it('can set progress to 100', () => {
      useUpdateStore.getState().setProgress(100);
      expect(useUpdateStore.getState().progress).toBe(100);
    });
  });

  describe('setChecking', () => {
    it('sets checking state', () => {
      useUpdateStore.getState().setChecking(true);
      expect(useUpdateStore.getState().checking).toBe(true);
    });

    it('clears checking state', () => {
      useUpdateStore.getState().setChecking(true);
      useUpdateStore.getState().setChecking(false);
      expect(useUpdateStore.getState().checking).toBe(false);
    });
  });

  describe('setStatusText', () => {
    it('sets status text', () => {
      useUpdateStore.getState().setStatusText('Downloading update...');
      expect(useUpdateStore.getState().statusText).toBe('Downloading update...');
    });

    it('can set to empty string', () => {
      useUpdateStore.getState().setStatusText('Some text');
      useUpdateStore.getState().setStatusText('');
      expect(useUpdateStore.getState().statusText).toBe('');
    });
  });

  describe('setCurrentVersion', () => {
    it('sets current app version', () => {
      useUpdateStore.getState().setCurrentVersion('1.5.0');
      expect(useUpdateStore.getState().currentVersion).toBe('1.5.0');
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useUpdateStore.getState().setAvailable('2.0.0');
      useUpdateStore.getState().setDownloading(true);
      useUpdateStore.getState().setProgress(75);
      useUpdateStore.getState().setChecking(true);
      useUpdateStore.getState().setStatusText('Downloading...');
      useUpdateStore.getState().setCurrentVersion('1.0.0');

      useUpdateStore.getState().reset();

      const s = useUpdateStore.getState();
      expect(s.available).toBe(false);
      expect(s.version).toBeNull();
      expect(s.downloading).toBe(false);
      expect(s.progress).toBe(0);
      expect(s.checking).toBe(false);
      expect(s.statusText).toBe('');
      expect(s.currentVersion).toBe('');
    });

    it('can be called multiple times safely', () => {
      useUpdateStore.getState().setAvailable('2.0.0');
      useUpdateStore.getState().reset();
      useUpdateStore.getState().reset();
      expect(useUpdateStore.getState().available).toBe(false);
    });
  });

  describe('combined workflows', () => {
    it('simulates a full update check and download cycle', () => {
      // Start checking
      useUpdateStore.getState().setChecking(true);
      useUpdateStore.getState().setStatusText('Checking for updates...');
      expect(useUpdateStore.getState().checking).toBe(true);

      // Found update
      useUpdateStore.getState().setChecking(false);
      useUpdateStore.getState().setAvailable('2.0.0');
      useUpdateStore.getState().setStatusText('Update available: 2.0.0');

      // Download
      useUpdateStore.getState().setDownloading(true);
      useUpdateStore.getState().setProgress(25);
      useUpdateStore.getState().setProgress(50);
      useUpdateStore.getState().setProgress(100);
      useUpdateStore.getState().setDownloading(false);
      useUpdateStore.getState().setStatusText('Ready to install');

      const s = useUpdateStore.getState();
      expect(s.available).toBe(true);
      expect(s.version).toBe('2.0.0');
      expect(s.downloading).toBe(false);
      expect(s.progress).toBe(100);
      expect(s.statusText).toBe('Ready to install');
    });
  });
});
