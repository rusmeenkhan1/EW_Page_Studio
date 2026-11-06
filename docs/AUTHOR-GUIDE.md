---
title: "ISE Boilerplate - Author Guide"
date: "June 12, 2026"
---

# ISE Boilerplate - Author Guide

This guide helps content authors and content managers create, edit, and publish content for the **ise-boilerplate** site. The project is built on AEM Edge Delivery Services and supports authoring with the **Universal Editor** as well as document-based authoring in Document Authoring (DA).

## Quick Reference

| Resource | URL |
|----------|-----|
| Document Authoring (DA) | https://da.live/#/aemdemos/ise-boilerplate/ |
| Preview | https://main--ise-boilerplate--aemdemos.aem.page/ |
| Live | https://main--ise-boilerplate--aemdemos.aem.live/ |
| Block Library | https://da.live/#/aemdemos/ise-boilerplate/.da/library |
| Bulk Operations | https://da.live/apps/bulk |

### Sites

| Site | Content Source (DA) | Preview | Live |
|------|---------------------|---------|------|
| ise-boilerplate | aemdemos/ise-boilerplate | https://main--ise-boilerplate--aemdemos.aem.page/ | https://main--ise-boilerplate--aemdemos.aem.live/ |

> Note: This site belongs to the shared **aemdemos** Config Service organization. The content path `aemdemos/ise-boilerplate` is taken from the site's content source (`content.da.live/aemdemos/ise-boilerplate/`) and is used to build the DA and Block Library URLs above.

## Getting Started

### Access Requirements

- [ ] DA access for the `aemdemos/ise-boilerplate` content path (request from your admin)
- [ ] An `@adobe.com` account — author and publish permissions are granted to `*@adobe.com`
- [ ] Preview / publish permissions (included with author access)

Admin contacts for access requests: **chelms@adobe.com**, **dfink@adobe.com**.

### Your First Page

1. Open DA: https://da.live/#/aemdemos/ise-boilerplate/
2. Navigate to the correct folder for your content.
3. Create a new document.
4. Insert blocks from the **Library** sidebar (see Block Library below).
5. Add a **Metadata** block at the bottom of the page (title, description, etc.).
6. **Preview**, review, then **Publish**.

> Tip: This project also supports the **Universal Editor (Canvas)**. The Sidekick exposes a "Canvas" plugin so you can edit pages visually in addition to document authoring.

## Content Organization

### Site Structure

Content lives under the `aemdemos/ise-boilerplate` path in DA. Pages are composed of **sections**, and each section contains default content (text, headings, images, links) and **blocks**. Use horizontal rules (`---`) to separate sections within a document.

### Navigation and Footer

Navigation and footer are content-driven and edited in DA:

| Element | Where to edit |
|---------|---------------|
| Navigation | The `nav` document in DA |
| Footer | The `footer` document in DA |

Edit these documents, then Preview and Publish to update the header/footer across the site.

### Languages

This project is configured as a single-language site. No additional language folders are defined. If localization is added later, language content typically lives in language-prefixed folders (e.g. `/en`, `/fr`) and reusable strings are managed via the Placeholders sheet.

## Block Library

The **Block Library** is the sidebar in Document Authoring where you browse and insert blocks into your document.

| What | Details |
|------|---------|
| **Open in DA** | Use the Library icon in the DA editor sidebar, or open the Block Library URL directly: https://da.live/#/aemdemos/ise-boilerplate/.da/library |
| **What's in it** | The blocks listed in "Available Blocks" below |
| **How to use** | Click a block in the library to insert it at the cursor position in your document |

When creating or editing a page, use the Library sidebar to add blocks instead of typing block names manually. In the Universal Editor, use the component picker, which is filtered to the blocks allowed in each section.

## Available Blocks

| Block | Purpose | Variants | Usage |
|-------|---------|----------|-------|
| accordion | Collapsible question/answer or expandable content panels | — | FAQs, expandable details where space is limited |
| card | A single card (image, title, text, link); used inside cards and card-carousel | — | Building block for card layouts |
| cards | A grid of cards | — | Feature lists, product/article tiles, link collections |
| card-carousel | A horizontally scrolling set of cards | — | Showcasing multiple cards in limited space |
| carousel | A rotating slideshow of content slides | — | Hero rotators, featured content galleries |
| columns | Multi-column side-by-side layout of text and images | — | Comparisons, paired text/image layouts |
| embed | Embeds external content (e.g. social, third-party) | embed-twitter | Embedding videos, posts, or external widgets |
| form | Renders a form from a form definition | — | Contact, signup, and data-capture forms |
| fragment | Reuses content from another document | — | Shared content (banners, promos) across pages |
| hero | Large banner with background image, heading, and call to action | — | Page headers, landing-page banners |
| modal | Pop-up dialog content | — | Overlays, alerts, gated content prompts |
| quote | Styled blockquote / testimonial | — | Testimonials, pull quotes, citations |
| search | On-page search experience | minimal | Search results pages, in-page search |
| section-title | Styled section heading with alignment, size, and color options | center, left, right; size-xs/s/m/l/xl/xxl; subtitle-size-xs/s/m/l/xl/xxl; color-text/dark/light/link/background | Section headers and titles with fine-grained styling |
| table | Tabular data | block | Specifications, schedules, comparison tables |
| tabs | Tabbed content panels | — | Grouping related content under selectable tabs |
| video | Embedded video player | — | Hosted video playback |

> The **section-title** block exposes alignment (`center`, `left`, `right`), title sizes (`size-xs` through `size-xxl`), subtitle sizes, and color treatments. Apply these as block variants/options.

## Page Templates

This project does not define named page templates in code. Pages are composed freely from sections and blocks. Page-level styling and behavior are controlled through **Section Metadata** (section styles) and the **Metadata** block (page properties) rather than a `template` value.

## Configuration Sheets

Configuration sheets are managed in DA (no local sheet files are committed to this repo). Create/edit them at the corresponding DA path, then Publish.

| Sheet | Location | Purpose | When to Update |
|-------|----------|---------|----------------|
| Placeholders | `/placeholders` in DA | Reusable text strings and translations | Changing labels, button text, configurable copy |
| Redirects | `/redirects` in DA | Forward old URLs to new URLs | After deleting, moving, or renaming pages |
| Bulk Metadata | `/metadata` in DA | Apply metadata to many pages via URL patterns | Setting default metadata by folder/section |

## Publishing Workflow

| Environment | Domain | Purpose |
|-------------|--------|---------|
| Preview | https://main--ise-boilerplate--aemdemos.aem.page/ | Test changes before going live |
| Live | https://main--ise-boilerplate--aemdemos.aem.live/ | Production site |

**Workflow:** Edit in DA (or Universal Editor) → **Preview** → review → **Publish** → Live immediately.

**Bulk preview/publish:** https://da.live/apps/bulk

## Common Tasks

| Task | Steps |
|------|-------|
| **Create a Page** | Navigate to folder → New → Document → Add content/blocks → Add Metadata → Preview → Publish |
| **Edit a Page** | Open in DA (or Canvas/Universal Editor) → Make changes → Preview → Publish |
| **Delete a Page** | Add a redirect first → Delete document → Publish the redirects sheet |
| **Update Navigation** | Edit the `nav` document → Preview → Publish |
| **Update Footer** | Edit the `footer` document → Preview → Publish |

## Sections and Section Metadata

**Sections** group content together. Create sections by separating content with horizontal rules (`---`).

**Add styles** with a Section Metadata block at the end of a section:

| Section Metadata |              |
|------------------|--------------|
| style            | [style-name] |

**Available Section Styles:**

| Style | Effect |
|-------|--------|
| light | Light background treatment for the section |
| highlight | Highlighted background treatment to draw attention to the section |

## Page Metadata

Add a **Metadata** block at the bottom of each page:

| Property | Required | Purpose | Example |
|----------|----------|---------|---------|
| `title` | Yes | Page title for SEO and browser tab | "About Us" |
| `description` | Yes | SEO and social description | "Learn about our team..." |
| `image` | No | Social sharing (Open Graph) image | /images/og.jpg |
| `keywords` | No | Comma-separated SEO keywords | "boilerplate, demo" |

## Images and Media

| Method | How |
|--------|-----|
| Drag & drop | Drag images directly into the DA editor |
| AEM Assets | Use the Assets sidebar in DA to pick managed assets |

**Best Practices:**

- Use descriptive filenames.
- Always add meaningful `alt` text (use empty alt only for purely decorative images).
- Author-uploaded images are automatically optimized.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Page not updating after publish | Wait 1–2 minutes for cache, then hard refresh (Cmd/Ctrl+Shift+R) |
| Block not displaying correctly | Check the block structure matches the expected format; verify the variant/option spelling |
| Images not showing | Verify the image was uploaded to DA and the path is correct |
| Section style not applied | Confirm the Section Metadata `style` value is `light` or `highlight` and is at the end of the section |
| Navigation/footer not updating | Re-publish the `nav` / `footer` document |

## Resources

| Resource | URL |
|----------|-----|
| DA Documentation | https://docs.da.live/ |
| Authoring Guide | https://www.aem.live/docs/authoring |
| Universal Editor Authoring | https://www.aem.live/docs/ue-authoring |
| Placeholders Docs | https://www.aem.live/docs/placeholders |
| Redirects Docs | https://www.aem.live/docs/redirects |

## Support Contacts

| Role | Contact |
|------|---------|
| Site admins | chelms@adobe.com, dfink@adobe.com |
| Authoring access | Any `@adobe.com` account has author/publish permissions |
