# Security

Codex Remote controls a trusted operator's local Codex runtime. A signed-in
operator may read local chat content and images, and execute actions allowed by
the native permission profile. This is not a multi-tenant isolation boundary.

## Deployment

- Use HTTPS and a strong access password.
- Keep the Desktop debug endpoint and the web origin's upstream listener private.
- Publish the password-protected web origin through a configured tunnel or
  trusted reverse proxy.
- Keep runtime secrets and logs outside source control.
- Review the selected native permission profile before granting full access.

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/CoralFlower325/Codex-remote/security/advisories/new)
for suspected vulnerabilities. Do not post credentials, live hostnames, private
paths, or real chat content in public issues.

Include a minimal reproduction, affected versions, impact, and redacted
diagnostics. If a credential has already been exposed, revoke or rotate it at
its provider.

The project is maintained on a best-effort basis without a guaranteed response
time. There is currently no separate supported-version matrix.
