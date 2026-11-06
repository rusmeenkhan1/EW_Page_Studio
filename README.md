# Your Project's Title...
Your project's description...

## Environments
- Preview: https://main--ise-boilerplate--aemdemos.aem.page/
- Live: https://main--ise-boilerplate--aemdemos.aem.live/

## Special features of this repo

- has both universal editor json for DA (enabled by default, see the `/ue/` folder) as well as Xwalk  (those _blockName.json files are in with the block folders, ignored by DA).
- has EMA-friendly block library pages, see `/tools/library-pages.md` for instructions on copying to your project
- more security and code quality items are addressed than the original boilerplate
- feature flags (most are on) for handy features are configurable in the `/scripts/feature-flags/features.js`
- Feature: section metadata can have background-color, background-image, or even use a gradient with "background".
- you can set 2 sections to show side by side with the style=flex in section metadata
- Feature: add span tags with classes to text elements, see `/docs/span-tags.md`
- Feature: add css classes for alignments, widths, and 'hide-mobile'/'hide-desktop', see `/docs/cell-class.md`
- Feature: You can nest blocks/embed a section in a block using the same bracket notation (ex. https://main--ise-boilerplate--aemdemos.aem.page/docs/library/blocks/nested-blocks ). See `/docs/nested-sections.md`
- You can embed a fragment, youtube or vimeo video just by using the URL
- automatically load a page via a modal just by linking to it in the /modals folder
- Separation of `/scripts/slider.js` is re-usedfor both Carousel and Card-carousel blocks, while the separate `/blocks/card` block (not for authoring directly) is re-used for both Cards and Card-carousel blocks
- Feature: You can handle CSS themes without touching code by overwriting tokens in a styles sheet in then authoring. (TO DO: document this feature)
- There is also automatic basic accessibility testing against the "after" URL via github actions on every PR. See `/docs/a11y-testing`

## Installation

```sh
npm i
```

## Linting
July 3 2026: This has been updated to use ESLint 10, with patch files to retrofit the Universal Editor/Xwalk plugin with JSON support (which are still in ESLint 9 format.)

This project is using StyleLint and ESLint for Javascript. Our ESLint configuration includes 3 popular and reputable Javascript code quality and security plugins:

- SonarSource eslint-plugin-sonarjs, a code quality analyzer for JavaScript and TypeScript within the Sonar ecosystem (https://github.com/SonarSource/SonarJS/blob/master/packages/jsts/src/rules/README.md#eslint-rules)
- Interlace secure-coding plugin for general secure coding practices and OWASP compliance for JavaScript/TypeScript (https://eslint.interlace.tools/docs/security/plugin-secure-coding/rules)
- Interlace browser-security for XSS, cookie, and DOM security rules for client-side JavaScript (https://eslint.interlace.tools/docs/security/plugin-browser-security/rules).

They are included in this command, which is run automatically via a github action on every pull request:

```sh
npm run lint
```

## Security Rules/Skills

- Adobe security automatically added .cursor/rules/security-global and security-lang, and seems to scan to check they are in place.
- Much of this ruleset (SQL, XXE, SSRF, server-side sessions, API versioning) targets backend/server code, while this repo is explicitly client-side-only with no runtime deps or backend.
- Since other agents (Claude, Codex) can't use Cursor rules, 


## Local development

1. Create a new repository based on the `aem-block-collection` template and add a mountpoint in the `fstab.yaml`
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `ise-boilerplate` directory in your favorite IDE and start coding :)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## General EDS Documentation

Before using the aem-block-collection, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/ue-tutorial)
1. [Creating Blocks](https://www.aem.live/developer/universal-editor-blocks) and [Content Modelling](https://www.aem.live/developer/component-model-definitions)
1. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
1. [Web Performance](https://www.aem.live/developer/keeping-it-100)
1. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)
1. [AEM Block Collection](https://www.aem.live/developer/block-collection#block-collection-1)
