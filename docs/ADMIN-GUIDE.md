---
title: "ise-boilerplate - Admin Guide"
date: "June 12, 2026"
---

# ise-boilerplate - Admin Guide

Complete administration guide for managing this Edge Delivery Services project. All values in this guide were retrieved from the Adobe Config Service API for the `aemdemos` organization.

## Project Summary

| Property | Value |
|----------|-------|
| **Organization** | aemdemos |
| **Site** | ise-boilerplate |
| **Setup Type** | Standard (single GitHub repo within a shared demo organization) |
| **Code Repository** | [aemdemos/ise-boilerplate](https://github.com/aemdemos/ise-boilerplate) (GitHub) |
| **Content Source** | https://content.da.live/aemdemos/ise-boilerplate/ (Document Authoring) |
| **Auth Requirement** | `requireAuth: auto` (preview/live require Adobe sign-in when accessed via the admin tooling) |

> Note: The `aemdemos` organization is a large shared demonstration tenant (hundreds of sites). This guide is scoped specifically to the `ise-boilerplate` site. Always include the exact site name in every Admin API call to avoid affecting other sites in the org.

## Quick Reference

### URLs

| Purpose | URL |
|---------|-----|
| **Login** | https://admin.hlx.page/login/aemdemos/ise-boilerplate |
| **Site Config** | https://admin.hlx.page/config/aemdemos/sites/ise-boilerplate.json |
| **Org Sites List** | https://admin.hlx.page/config/aemdemos/sites.json |
| **Preview** | https://main--ise-boilerplate--aemdemos.aem.page/ |
| **Live** | https://main--ise-boilerplate--aemdemos.aem.live/ |
| **Content (DA)** | https://content.da.live/aemdemos/ise-boilerplate/ |
| **Code Repo** | https://github.com/aemdemos/ise-boilerplate |

### Site Details

| Site | Content Source (DA) | Preview | Live |
|------|---------------------|---------|------|
| ise-boilerplate | https://content.da.live/aemdemos/ise-boilerplate/ | https://main--ise-boilerplate--aemdemos.aem.page/ | https://main--ise-boilerplate--aemdemos.aem.live/ |

## Access Control

The site's access roles (from the Config Service `access.admin.role` configuration) are:

| Role | Members | Capability |
|------|---------|-----------|
| **Admin** | `chelms@adobe.com`, `dfink@adobe.com` | Full administration, including config and access management |
| **Author** | `*@adobe.com` (any Adobe ID) | Edit and preview content |
| **Publish** | `*@adobe.com` (any Adobe ID) | Publish content to live |
| **Config** | `*@adobe.com` (any Adobe ID) | Modify site configuration |

`requireAuth` is set to `auto`, meaning authentication is enforced automatically where applicable.

> Important: Because Author/Publish/Config are open to any `*@adobe.com` identity, only the two named admins should perform sensitive operations such as access changes or configuration edits.

## Authentication

### Login

1. Open: https://admin.hlx.page/login/aemdemos/ise-boilerplate
2. Sign in with your Adobe ID
3. Copy the auth token for API operations and export it:
   ```bash
   export AUTH_TOKEN="<your-token>"
   ```

### Logout

```bash
curl -X POST \
  -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/logout/aemdemos/ise-boilerplate/main"
```

## User Management

### View Current Access

```bash
curl -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/config/aemdemos/sites/ise-boilerplate/access.json"
```

### Add a User

| Role | Command |
|------|---------|
| Admin | `POST /config/aemdemos/sites/ise-boilerplate/access/admin.json` with body `{"users": ["email"]}` |
| Author | `POST /config/aemdemos/sites/ise-boilerplate/access/author.json` with body `{"users": ["email"]}` |

Example:

```bash
curl -X POST \
  -H "x-auth-token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users": ["newadmin@adobe.com"]}' \
  "https://admin.hlx.page/config/aemdemos/sites/ise-boilerplate/access/admin.json"
```

### Remove a User

```bash
curl -X DELETE \
  -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/config/aemdemos/sites/ise-boilerplate/access/admin/{email}.json"
```

## Content Operations

### Preview

| Operation | Endpoint |
|-----------|----------|
| Single page | `POST /preview/aemdemos/ise-boilerplate/main/{path}` |
| Bulk preview | `POST /preview/aemdemos/ise-boilerplate/main/*` |

```bash
curl -X POST \
  -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/preview/aemdemos/ise-boilerplate/main/index"
```

### Publish

| Operation | Endpoint |
|-----------|----------|
| Single page | `POST /live/aemdemos/ise-boilerplate/main/{path}` |
| Bulk publish | `POST /live/aemdemos/ise-boilerplate/main/*` |
| Unpublish | `DELETE /live/aemdemos/ise-boilerplate/main/{path}` |

```bash
curl -X POST \
  -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/live/aemdemos/ise-boilerplate/main/index"
```

### Cache

| Operation | Endpoint |
|-----------|----------|
| Purge path | `POST /cache/aemdemos/ise-boilerplate/main/{path}` |
| Purge all | `POST /cache/aemdemos/ise-boilerplate/main/*` |

## Code Operations

The code lives in the GitHub repository `aemdemos/ise-boilerplate`. Code is normally synced automatically via the AEM Code Sync GitHub App on push to `main`. To trigger a manual sync:

```bash
curl -X POST \
  -H "x-auth-token: $AUTH_TOKEN" \
  "https://admin.hlx.page/code/aemdemos/ise-boilerplate/main"
```

## Sidekick / Authoring Tools

This site has a custom Sidekick plugin configured:

| Plugin ID | Title | Environments | Event |
|-----------|-------|--------------|-------|
| `experience-workspace` | Canvas | dev, preview, live | `experience-workspace` |

Authors use the Sidekick "Canvas" plugin (Experience Workspace) when working in the supported environments. Content is authored in Document Authoring (DA) at https://content.da.live/aemdemos/ise-boilerplate/.

## Common Tasks

| Task | Steps |
|------|-------|
| **Add a new admin** | `POST /config/aemdemos/sites/ise-boilerplate/access/admin.json` with `{"users":["email"]}` |
| **Republish the whole site** | `POST /preview/aemdemos/ise-boilerplate/main/*` then `POST /live/aemdemos/ise-boilerplate/main/*` |
| **Clear all cache** | `POST /cache/aemdemos/ise-boilerplate/main/*` |
| **Deploy code changes** | Push to `main` (auto-sync), or `POST /code/aemdemos/ise-boilerplate/main` |
| **Check current access** | `GET /config/aemdemos/sites/ise-boilerplate/access.json` |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token expired — log in again at the login URL |
| 403 Forbidden | Insufficient permissions — confirm you are in the `admin` role |
| 404 Not Found | Check org/site/path spelling; confirm the site name is `ise-boilerplate` |
| 429 Rate Limited | Wait and retry |
| Cache not clearing | Retry the purge with `forceUpdate: true` |
| Code not syncing | Trigger a manual sync: `POST /code/aemdemos/ise-boilerplate/main` |
| Wrong site affected | Verify the exact site name in the path — the org has many sites |

## Resources

| Resource | URL |
|----------|-----|
| Admin API Docs | https://www.aem.live/docs/admin.html |
| Config Service Setup | https://www.aem.live/docs/config-service-setup |
| Document Authoring | https://da.live/ |
| AEM Edge Delivery Docs | https://www.aem.live/docs/ |
