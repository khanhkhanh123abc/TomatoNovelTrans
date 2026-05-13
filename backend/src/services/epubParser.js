const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');

const dirOf = (p) => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i + 1);
};

const resolveZipPath = (base, rel) => {
  if (!rel) return rel;
  if (rel.startsWith('/')) return rel.slice(1);
  const parts = (base + rel).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
};

async function buildTitleMap(zip, opfDir, manifest) {
  const map = new Map();

  // toc.ncx (EPUB 2)
  const ncx = manifest.find(
    (m) => m.mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(m.href || '')
  );
  if (ncx) {
    const ncxPath = resolveZipPath(opfDir, ncx.href);
    const file = zip.file(ncxPath);
    if (file) {
      try {
        const xml = await file.async('string');
        const dom = new JSDOM(xml, { contentType: 'application/xml' });
        const ncxDir = dirOf(ncxPath);
        dom.window.document.querySelectorAll('navPoint').forEach((np) => {
          const label = np.querySelector('navLabel > text')?.textContent?.trim();
          const src = np.querySelector('content')?.getAttribute('src');
          if (label && src) {
            const full = resolveZipPath(ncxDir, src.split('#')[0]);
            if (!map.has(full)) map.set(full, label);
          }
        });
      } catch {}
    }
  }

  // nav.xhtml (EPUB 3)
  const nav = manifest.find((m) => (m.properties || '').includes('nav'));
  if (nav) {
    const navPath = resolveZipPath(opfDir, nav.href);
    const file = zip.file(navPath);
    if (file) {
      try {
        const xml = await file.async('string');
        const dom = new JSDOM(xml);
        const navDir = dirOf(navPath);
        dom.window.document.querySelectorAll('nav a, ol li a, ul li a').forEach((a) => {
          const label = a.textContent.trim();
          const href = a.getAttribute('href');
          if (label && href) {
            const full = resolveZipPath(navDir, href.split('#')[0]);
            if (!map.has(full)) map.set(full, label);
          }
        });
      } catch {}
    }
  }

  return map;
}

async function parseEpub(epubPath) {
  const buf = fs.readFileSync(epubPath);
  const zip = await JSZip.loadAsync(buf);

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('container.xml missing');
  const containerDom = new JSDOM(await containerFile.async('string'), { contentType: 'application/xml' });
  const opfPath = containerDom.window.document.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('rootfile path missing in container.xml');

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`${opfPath} missing in EPUB`);
  const opfXml = await opfFile.async('string');
  const opfDom = new JSDOM(opfXml, { contentType: 'application/xml' });
  const opfDir = dirOf(opfPath);

  const meta = opfDom.window.document;
  const title =
    meta.querySelector('metadata > title, metadata dc\\:title')?.textContent?.trim() ||
    path.basename(epubPath, '.epub');
  const author =
    meta.querySelector('metadata > creator, metadata dc\\:creator')?.textContent?.trim() || null;

  const manifest = Array.from(meta.querySelectorAll('manifest > item')).map((it) => ({
    id: it.getAttribute('id'),
    href: it.getAttribute('href'),
    mediaType: it.getAttribute('media-type'),
    properties: it.getAttribute('properties') || '',
  }));
  const manifestById = new Map(manifest.map((m) => [m.id, m]));

  const spineRefs = Array.from(meta.querySelectorAll('spine > itemref'))
    .map((ir) => ir.getAttribute('idref'))
    .filter(Boolean);

  const titleMap = await buildTitleMap(zip, opfDir, manifest);

  const chapters = [];
  for (const idref of spineRefs) {
    const item = manifestById.get(idref);
    if (!item) continue;
    if (item.mediaType && !/html|xml/.test(item.mediaType)) continue;

    const full = resolveZipPath(opfDir, item.href);
    const file = zip.file(full);
    if (!file) continue;

    const html = await file.async('string');
    const dom = new JSDOM(html);
    const body = dom.window.document.body;
    if (!body) continue;

    body.querySelectorAll('script, style').forEach((n) => n.remove());
    const text = body.textContent.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text || text.length < 10) continue;

    chapters.push({
      index: chapters.length,
      title: titleMap.get(full) || `Chương ${chapters.length + 1}`,
      content: text,
    });
  }

  return { title, author, chapters };
}

module.exports = { parseEpub };
