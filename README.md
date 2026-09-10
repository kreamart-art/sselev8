# S&S Elev8 Entertainment

Boutique music management website — five-page bilingual (EN/NL) static site.

Live: https://elev8entertainment.nl/

## Stack

Pure HTML / CSS / JS — no frameworks, no build step. Drop the files on any static host.

## Pages

- `index.html` — manifesto hero, KREAM feature, philosophy
- `about.html` — convictions and method
- `services.html` — six disciplines, four-step process
- `roster.html` — KREAM full card + upcoming signings
- `contact.html` — direct emails + intake form + FAQ

## Bilingual

Every translatable string is rendered twice in the HTML:

```html
<span data-show="en">English</span><span data-show="nl">Nederlands</span>
```

`html[data-lang="en"]` and `html[data-lang="nl"]` toggle visibility via CSS. The language is set before render via an inline `<script>` in `<head>` (no flash), persisted in `localStorage`, and propagated via `?lang=` on internal links.

## Design tokens

- Background: `#0a0a0a`
- Gold: `#c9a961` (bright `#e6c878`, deep `#8a7544`)
- Emerald (live states only): `#1a8a63`
- Cream body: `#f5f0e8`

## Fonts

Google Fonts — Big Shoulders Display, Cormorant Garamond Italic, Manrope, JetBrains Mono.

## Assets

- `logo.png` — gold 3D wordmark (transparent PNG)
- `kream.jpg` — KREAM cover artwork
- `banner-hero.jpg` — homepage hero banner
