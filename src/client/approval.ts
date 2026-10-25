export type PermissionDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

type CommandDecision = PermissionDecision
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } }
  | { applyNetworkPolicyAmendment: { network_policy_amendment: { action: 'allow' | 'deny'; host: string } } };

export function commandApprovalOptions(available: unknown): Array<{
  decision: CommandDecision;
  label: string;
  detail?: string;
}> {
  const options: ReturnType<typeof commandApprovalOptions> = approvalDecisions(available).map((decision) => ({
    decision,
    label: decision === 'accept' ? '允许一次' : decision === 'acceptForSession' ? '本次会话允许' : decision === 'cancel' ? '取消' : '拒绝'
  }));
  if (!Array.isArray(available)) return options;
  for (const decision of available) {
    const prefix = decision?.acceptWithExecpolicyAmendment?.execpolicy_amendment;
    const network = decision?.applyNetworkPolicyAmendment?.network_policy_amendment;
    if (Array.isArray(prefix) && prefix.length > 0 && prefix.every((word) => typeof word === 'string')) {
      options.push({ decision, label: '始终允许类似命令', detail: prefix.join(' ') });
    } else if (network && (network.action === 'allow' || network.action === 'deny') && typeof network.host === 'string') {
      options.push({ decision, label: network.action === 'allow' ? '允许访问此主机' : '拒绝访问此主机', detail: network.host });
    }
  }
  return options;
}

export function approvalDecisions(available: unknown): PermissionDecision[] {
  const defaults: PermissionDecision[] = ['decline', 'acceptForSession', 'accept'];
  return Array.isArray(available)
    ? (['cancel', ...defaults] as PermissionDecision[]).filter((decision) => available.includes(decision))
    : defaults;
}

export interface RequestedPermissions {
  network?: unknown;
  fileSystem?: unknown;
}

export function permissionApprovalResponse(
  decision: PermissionDecision,
  permissions: RequestedPermissions | undefined
): {
  permissions: RequestedPermissions;
  scope: 'turn' | 'session';
} {
  if (decision === 'decline' || decision === 'cancel') {
    return { permissions: {}, scope: 'turn' };
  }

  return {
    permissions: {
      ...(permissions?.network ? { network: permissions.network } : {}),
      ...(permissions?.fileSystem ? { fileSystem: permissions.fileSystem } : {})
    },
    scope: decision === 'acceptForSession' ? 'session' : 'turn'
  };
}
