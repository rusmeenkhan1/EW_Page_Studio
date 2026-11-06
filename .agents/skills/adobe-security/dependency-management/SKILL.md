---
name: dependency-management
description: Supply-chain and dependency security guidance, including scanning and remediation practices (Snyk Code/SCA/IaC or equivalent). Use when adding, updating, or reviewing third-party dependencies, package files, or supply chain security.
---

# Dependency Management

Proper management of dependencies is critical for maintaining security in modern applications.

## Supply Chain Security

- Verify the authenticity of package sources
- Use package lockfiles for deterministic builds
- Apply dependency pinning for critical packages
- Regularly review and update dependencies
- Monitor dependencies for security advisories

## Vulnerability Management

### Scanning and Monitoring

- Implement automated vulnerability scanning
- Use dependency scanning in CI/CD pipelines
- Configure automated alerts for new vulnerabilities
- Maintain a vulnerability management process
- Document vulnerability handling procedures
- If Snyk (or an equivalent scanner) is available, run Code scanning on new first-party code, SCA scanning on new/updated dependencies, and IaC scanning on infrastructure-as-code changes; fix findings using the scanner's context, then rescan until clean

### Remediation

- Prioritize vulnerabilities based on risk
- Establish SLAs for vulnerability remediation
- Test updates before applying to production
- Maintain a security patch management process
- Document exceptions with compensating controls

## Best Practices

- Minimize dependency usage - evaluate necessity
- Prefer well-maintained, widely-used packages
- Review package code and maintainer reputation
- Implement dependency governance policies
- Consider legal and license implications

## Anti-Patterns to Avoid

- Using unvetted or abandoned packages
- Neglecting regular dependency updates
- Ignoring security warnings
- Overriding security controls with forced installs
- Using direct GitHub/source URLs without version pinning
