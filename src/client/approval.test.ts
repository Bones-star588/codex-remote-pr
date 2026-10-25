import { describe, expect, it } from 'vitest';

import { approvalDecisions, commandApprovalOptions, permissionApprovalResponse } from './approval';

describe('permission approval responses', () => {
  const permissions = {
    network: { enabled: true },
    fileSystem: { read: ['C:\\workspace'], write: null }
  };

  it('grants the requested permissions for one turn', () => {
    expect(permissionApprovalResponse('accept', permissions)).toEqual({
      permissions,
      scope: 'turn'
    });
  });

  it('grants the requested permissions for the session', () => {
    expect(permissionApprovalResponse('acceptForSession', permissions)).toEqual({
      permissions,
      scope: 'session'
    });
  });

  it('does not grant permissions when declined', () => {
    expect(permissionApprovalResponse('decline', permissions)).toEqual({
      permissions: {},
      scope: 'turn'
    });
  });

  it('only offers the native decisions supported by the pending command', () => {
    expect(approvalDecisions(['accept', { acceptWithExecpolicyAmendment: {} }, 'cancel'])).toEqual(['cancel', 'accept']);
    expect(approvalDecisions(undefined)).toEqual(['decline', 'acceptForSession', 'accept']);
    expect(permissionApprovalResponse('cancel', permissions)).toEqual({ permissions: {}, scope: 'turn' });
  });

  it('returns the exact native policy amendment without inventing unsupported choices', () => {
    const command = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'status'] } };
    const network = { applyNetworkPolicyAmendment: { network_policy_amendment: { action: 'allow', host: 'example.com' } } };
    const options = commandApprovalOptions(['cancel', 'accept', command, network]);
    expect(options.map((option) => option.decision)).toEqual(['cancel', 'accept', command, network]);
    expect(options.at(-1)?.detail).toBe('example.com');
    expect(commandApprovalOptions(['cancel', 'accept'])).toHaveLength(2);
  });
});
