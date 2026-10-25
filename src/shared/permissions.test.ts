import { describe, expect, it } from 'vitest';
import { permissionLabel, permissionProfileId, permissionProfileUpdate } from './permissions';

describe('native permission profiles', () => {
  it('reads native active profiles and legacy sandbox settings', () => {
    expect(permissionProfileId({ activePermissionProfile: { id: 'custom' }, sandbox: { type: 'readOnly' } })).toBe('custom');
    expect(permissionProfileId({ sandbox: { type: 'dangerFullAccess' } })).toBe(':danger-full-access');
    expect(permissionProfileId({ sandbox_mode: 'workspace-write' })).toBe(':workspace');
    expect(permissionProfileId({ default_permissions: ':read-only' })).toBe(':read-only');
    expect(permissionProfileId({})).toBeNull();
  });
  it('uses native ids and approval policies without changing custom profile settings', () => {
    expect(permissionProfileUpdate(':workspace')).toEqual({ permissions: ':workspace', approvalPolicy: 'on-request', approvalsReviewer: 'user' });
    expect(permissionProfileUpdate(':danger-full-access').approvalPolicy).toBe('never');
    expect(permissionProfileUpdate('custom')).toEqual({ permissions: 'custom' });
    expect(permissionLabel(':read-only')).toBe('只读');
  });
});
