import { describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types';
import type { T3HostSettings } from '@/types/settings';
import { addressProblem, configuredHosts, isRemote, LOCAL_HOST, rawId, scopedId } from '../hosts';

function settingsWith(t3Hosts: T3HostSettings[] | undefined): AppSettings {
  const { settings } = useSettingsStore.getState();
  const agents = { ...settings.agents, t3Hosts } as typeof settings.agents;
  return { ...settings, agents };
}

describe('configuredHosts', () => {
  it('follows only the T3 on this machine when no other host is set', () => {
    expect(configuredHosts(settingsWith(undefined))).toEqual([LOCAL_HOST]);
  });

  it('puts this machine first, then the hosts from settings', () => {
    const hosts = configuredHosts(
      settingsWith([
        { id: 'a1', label: ' Mac mini ', baseUrl: ' http://mac-mini:3773 ' },
        { id: 'b2', label: '', baseUrl: 'https://vm.example:3773' },
      ]),
    );
    expect(hosts).toEqual([
      LOCAL_HOST,
      { id: 'a1', label: 'Mac mini', baseUrl: 'http://mac-mini:3773' },
      { id: 'b2', label: 'b2', baseUrl: 'https://vm.example:3773' },
    ]);
  });

  it('skips a host without an address, and one that claims to be this machine', () => {
    const hosts = configuredHosts(
      settingsWith([
        { id: 'a1', label: 'Empty', baseUrl: '  ' },
        { id: 'local', label: 'Impostor', baseUrl: 'http://elsewhere:3773' },
      ]),
    );
    expect(hosts).toEqual([LOCAL_HOST]);
  });
});

describe('host ids', () => {
  it('prefixes the ids of a remote host and leaves local ones alone', () => {
    expect(scopedId('local', 't1')).toBe('t1');
    expect(scopedId('mac', 't1')).toBe('mac:t1');
    expect(rawId('mac', 'mac:t1')).toBe('t1');
    expect(rawId('local', 'mac:t1')).toBe('mac:t1');
  });

  it('knows a remote host from the local one', () => {
    expect(isRemote(LOCAL_HOST)).toBe(false);
    expect(isRemote({ id: 'mac' })).toBe(true);
  });
});

describe('addressProblem', () => {
  it('accepts an http or https address', () => {
    expect(addressProblem('http://mac-mini:3773')).toBeNull();
    expect(addressProblem(' https://vm.example ')).toBeNull();
  });

  it('says what is wrong with anything else', () => {
    expect(addressProblem('  ')).toBe('Give the address of the T3 server.');
    expect(addressProblem('mac-mini:3773')).toBe('Start the address with http:// or https://.');
    expect(addressProblem('http://')).toBe('That is not a valid address.');
  });
});
