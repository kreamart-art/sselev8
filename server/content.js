import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

marked.setOptions({ gfm: true, breaks: true })

const SANITIZE = {
  allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'img', 'figure', 'figcaption'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title', 'loading'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  transformTags: {
    // Headings from the editor never outrank the page title.
    h1: 'h2',
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
    a: (tagName, attribs) => {
      const href = attribs.href || ''
      const external = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?elev8entertainment\.nl/i.test(href)
      return { tagName, attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : attribs }
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
  },
}

export function markdown(src) {
  return sanitizeHtml(marked.parse(String(src || '')), SANITIZE)
}

export function plainText(src) {
  return sanitizeHtml(marked.parse(String(src || '')), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerpt(src, max = 180) {
  const text = plainText(src)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
}

export function slugify(str) {
  return (
    String(str || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' en ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post'
  )
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])

export function formatDate(ts, lang) {
  if (!ts) return ''
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(ts))
}
