// Bundled background (MV2) - core modules inlined
// Dependencies (loaded via manifest): browser-polyfill, libs/*

// ---- utils.js ----
function validateUri(href, baseURI) {
  try { new URL(href); return href; } catch (e) {
    try { return new URL(href, baseURI).href; } catch (e2) { return href; }
  }
}
function getImageFilename(src, options, prependFilePath = true) {
  const slashPos = src.lastIndexOf('/');
  const queryPos = src.indexOf('?');
  let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);
  const hashPos = filename.indexOf('#');
  if (hashPos > 0) filename = filename.substring(0, hashPos);
  // sanitize illegal characters for filesystem
  filename = filename.replace(/[\/\?<>\\:\*\|":]/g, '_');
  if (prependFilePath && options.imagePath) filename = options.imagePath + filename;
  return filename;
}
function textReplace(string, article, disallowedChars = null) {
  if (string == null) string = '';
  for (const key in article) {
    if (article.hasOwnProperty(key) && key != "content") {
      let s = (article[key] || '') + '';
      string = string.split('{' + key + '}').join(s);
    }
  }
  const date = new Date();
  string = string.split('{date}').join(date.toISOString().split('T')[0]);
  string = string.split('{datetime}').join(date.toISOString().replace('T', ' ').split('.')[0]);
  string = string.split('{timestamp}').join(date.getTime());
  if (disallowedChars) {
    for (let c of disallowedChars) string = string.split(c).join('');
  }
  return string;
}
function generateValidFileName(title, disallowedChars = null, maxLength = null) {
  if (!title) return title; else title = title + '';
  var illegalRe = /[\/\?<>\\:\*\|":]/g;
  var name = title.replace(illegalRe, "").replace(new RegExp('\u00A0', 'g'), ' ') // nbsp
      .replace(new RegExp(/\s+/, 'g'), ' ').trim();
  if (disallowedChars) {
    for (let c of disallowedChars) {
      if (`[\\^$.|?*+()`.includes(c)) c = `\\${c}`;
      name = name.replace(new RegExp(c, 'g'), '');
    }
  }
  // Tronquer intelligemment si maxLength est spécifié
  if (maxLength && name.length > maxLength) {
    // Trouver le dernier espace avant maxLength pour couper sur un mot complet
    const lastSpace = name.lastIndexOf(' ', maxLength);
    if (lastSpace > maxLength * 0.7) { // Au moins 70% de la longueur max
      name = name.substring(0, lastSpace);
    } else {
      name = name.substring(0, maxLength);
    }
    name = name.trim();
  }
  return name;
}
function base64EncodeUnicode(str) {
  const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode('0x' + p1);
  });
  return btoa(utf8Bytes);
}

// ---- image-handler.js ----
function findOriginalImageUrl(node) {
  const dataSrc = node.getAttribute('data-src');
  if (dataSrc) return dataSrc;
  const srcset = node.getAttribute('srcset');
  if (srcset) {
    const sources = srcset.split(',').map(s => s.trim().split(/\s+/));
    sources.sort((a, b) => (parseInt(b[1])||0) - (parseInt(a[1])||0));
    return sources[0] ? sources[0][0] : null;
  }
  const src = node.getAttribute('src');
  if (src && src.includes('medium.com')) {
    return src.replace(/\/v2\/resize:[^\/]+\//g, '/');
  }
  return src;
}
function fetchImageAsUint8Array(url) {
  return new Promise((resolve, reject) => {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return reject(new Error('Invalid data: URL'));
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return resolve(bytes);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 15000;
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) resolve(new Uint8Array(xhr.response));
      else reject(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Timeout'));
    xhr.send();
  });
}
async function preDownloadImages(imageList, markdown, options) {
  let newImageList = {};
  await Promise.all(Object.entries(imageList).map(([src, filename]) => new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src);
    xhr.responseType = "blob";
    xhr.onload = async function () {
      const blob = xhr.response;
      if (options.imageStyle == 'base64') {
        var reader = new FileReader();
        reader.onloadend = function () {
          markdown = markdown.replaceAll(src, reader.result);
          resolve();
        };
        reader.readAsDataURL(blob);
      } else {
        let newFilename = filename;
        if (newFilename.endsWith('.idunno') && window.mimedb) {
          newFilename = filename.replace('.idunno', '.' + mimedb[blob.type]);
          if (!options.imageStyle.startsWith("obsidian")) {
            markdown = markdown.replaceAll(filename.split('/').map(s => encodeURI(s)).join('/'), newFilename.split('/').map(s => encodeURI(s)).join('/'))
          } else {
            markdown = markdown.replaceAll(filename, newFilename);
          }
        }
        newImageList[src] = newFilename;
        resolve();
      }
    };
    xhr.onerror = function() { console.warn("Failed to pre-download image:", src); resolve(); };
    xhr.send();
  })));
  return { markdown, imageList: newImageList };
}

// ---- turndown.js (rule setup) ----
function setupTurndown(content, options, article, includeImageLinks = false) {
  if (options.turndownEscape) TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = s => s;
  var turndownService = new TurndownService(options);
  turndownService.use(turndownPluginGfm.gfm);
  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);
  let imageList = {};
  turndownService.addRule('images', {
    filter: function (node) {
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        let src = node.getAttribute('src');
        node.setAttribute('src', validateUri(src, article.baseURI));
        // Toujours collecter les images pour le téléchargement, mais ne générer les inserts que si includeImageLinks=true
        if (options.downloadImages) {
          const originalSrc = findOriginalImageUrl(node) || src;
          if (!originalSrc) return true;
          let imageFilename = getImageFilename(originalSrc, options, false);
          if (!imageList[originalSrc] || imageList[originalSrc] != imageFilename) {
            let i = 1;
            while (Object.values(imageList).includes(imageFilename)) {
              const parts = imageFilename.split('.');
              if (i == 1) parts.splice(parts.length - 1, 0, i++);
              else parts.splice(parts.length - 2, 1, i++);
              imageFilename = parts.join('.');
            }
            imageList[originalSrc] = imageFilename;
          }
          const obsidianLink = options.imageStyle.startsWith("obsidian");
          const localSrc = options.imageStyle === 'obsidian-nofolder'
            ? imageFilename.substring(imageFilename.lastIndexOf('/') + 1)
            : imageFilename.split('/').map(s => obsidianLink ? s : encodeURI(s)).join('/');
          if(options.imageStyle != 'originalSource' && options.imageStyle != 'base64') node.setAttribute('src', localSrc);
          return true;
        }
        else return true;
      }
      return false;
    },
    replacement: function (content, node) {
      // Si includeImageLinks=false, ne rien générer (pas de placeholders)
      if (!includeImageLinks) return '';
      if (options.imageStyle == 'noImage') return '';
      else if (options.imageStyle.startsWith('obsidian')) return `![[${node.getAttribute('src')}]]`;
      else {
        var alt = cleanAttribute(node.getAttribute('alt'));
        var src = node.getAttribute('src') || '';
        var title = cleanAttribute(node.getAttribute('title'));
        var titlePart = title ? ' "' + title + '"' : '';
        if (options.imageRefStyle == 'referenced') {
          var id = this.references.length + 1;
          this.references.push('[fig' + id + ']: ' + src + titlePart);
          return '![' + alt + '][fig' + id + ']';
        }
        else return src ? '![' + alt + '](' + src + titlePart + ')' : '';
      }
    },
    references: [],
    append: function () {
      var references = '';
      if (this.references.length) {
        references = '\n\n' + this.references.join('\n') + '\n\n';
        this.references = [];
      }
      return references;
    }
  });
  turndownService.addRule('links', {
    filter: function (node) { return node.nodeName == 'A' && node.getAttribute('href'); },
    replacement: function (content, node) {
      var href = node.getAttribute('href');
      var title = cleanAttribute(node.getAttribute('title'));
      var titlePart = title ? ' "' + title + '"' : '';
      if (options.linkStyle == 'inlined' || options.linkStyle == 'inlinedCaps') {
        if (options.linkStyle == 'inlinedCaps') content = content.toUpperCase();
        return '[' + content + '](' + href + titlePart + ')';
      }
      else if (options.linkStyle == 'referenced') {
        var id = this.references.length + 1;
        this.references.push('[' + id + ']: ' + href + titlePart);
        return '[' + content + '][' + id + ']';
      }
      else return content;
    },
    references: [],
    append: function () {
      var references = '';
      if (this.references.length) {
        references = '\n\n' + this.references.join('\n') + '\n\n';
        this.references = [];
      }
      return references;
    }
  });
  turndownService.addRule('codeBlocks', {
    filter: function (node) { return node.nodeName == 'PRE' && node.firstChild && node.firstChild.nodeName == 'CODE'; },
    replacement: function (content, node) {
      var code = node.firstChild.textContent;
      var language = node.firstChild.getAttribute('class') || '';
      if (language) language = language.replace('language-', '');
      return '```' + language + '\n' + code + '\n```';
    }
  });
  turndownService.addRule('code', {
    filter: function (node) {
      var hasSiblings = node.previousSibling || node.nextSibling;
      var isNameCode = node.nodeName == 'CODE' && !hasSiblings;
      return isNameCode;
    },
    replacement: function (content) { return '`' + content + '`'; }
  });
  turndownService.addRule('strikethrough', {
    filter: function (node) { return node.nodeName == 'S' || node.nodeName == 'DEL' || node.nodeName == 'STRIKE'; },
    replacement: function (content) { return '~~' + content + '~~'; }
  });
  turndownService.addRule('highlight', {
    filter: function (node) { return node.nodeName == 'MARK'; },
    replacement: function (content) { return '==' + content + '=='; }
  });
  turndownService.addRule('footnotes', {
    filter: function (node) { return node.nodeName == 'SUP' && node.getAttribute('class') == 'footnote'; },
    replacement: function (content) { return '[^' + content + ']'; }
  });
  turndownService.addRule('tables', {
    filter: function (node) { return node.nodeName == 'TABLE'; },
    replacement: function (content, node) {
      var tables = [], table = [], headers = [];
      var rows = node.querySelectorAll('tr');
      rows.forEach(function (row) {
        var cells = row.querySelectorAll('td, th');
        var rowText = [];
        cells.forEach(function (cell) {
          var cellText = turndownService.turndown(cell.innerHTML);
          rowText.push(cellText);
        });
        if (row.parentNode.nodeName == 'THEAD') headers.push(rowText);
        else table.push(rowText);
      });
      if (headers.length) {
        tables.push(headers[0].join(' | '));
        tables.push(headers[0].map(function () { return '---'; }).join(' | '));
      }
      table.forEach(function (row) { tables.push(row.join(' | ')); });
      return '\n\n' + tables.join('\n') + '\n\n';
    }
  });
  var markdown = turndownService.turndown(content);
  markdown = markdown.replace(/^Press enter or click to view image in full size\s*$/gmi, '').replace(/\n{3,}/g, '\n\n');
  return { markdown, imageList };
}
function cleanAttribute(attribute) { return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''; }

// ---- converter.js ----
async function convertArticleToMarkdown(article, downloadImages = null, skipPreDownload = false, includeImageLinks = false) {
  const options = await getOptions();
  if (downloadImages != null) options.downloadImages = downloadImages;
  // Compute imageStyle if not present (same logic as options.js)
  if (!options.imageStyle && options.imageStyleWith && options.imageStyleWithout) {
    options.imageStyle = options.downloadImages ? options.imageStyleWith : options.imageStyleWithout;
  }
  if (!options.downloadImages) options.imageStyle = 'noImage';
  let imageList = {};
  const result = setupTurndown(article.content, options, article, includeImageLinks);
  let markdown = result.markdown; imageList = result.imageList;
  markdown = markdown.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  if (options.downloadImages) {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g; let match; const usedImages = new Set();
    while ((match = imageRegex.exec(markdown)) !== null) {
      const imageUrl = match[2];
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
        for (const [src, localPath] of Object.entries(imageList)) {
          const normalized = localPath.split('\\').join('/').replace(/^\//, '');
          if (imageUrl === normalized || imageUrl.endsWith(normalized)) { usedImages.add(src); break; }
        }
      }
    }
    const newImageList = {}; for (const src of usedImages) newImageList[src] = imageList[src];
    imageList = newImageList;
  }
  console.log('[convertArticleToMarkdown] downloadImages:', options.downloadImages, 'imageList:', Object.keys(imageList));
  if (options.downloadImages && options.downloadMode == 'downloadsApi' && !skipPreDownload) {
    const pre = await preDownloadImages(imageList, markdown, options);
    markdown = pre.markdown; imageList = pre.imageList;
  }
  // Appliquer les templates front/back matter uniquement si includeTemplate=true
  if (options.includeTemplate) {
    markdown = textReplace(options.frontmatter, article, options.disallowedChars) + markdown + textReplace(options.backmatter, article, options.disallowedChars);
  }
  return { markdown, imageList };
}

// ---- formatter.js ----
async function formatTitle(article) {
  let options = await getOptions();
  let title = textReplace(options.title, article, options.disallowedChars + '/');
  title = generateValidFileName(title, null, options.maxTitleLength);
  return title;
}
async function formatMdClipsFolder(article) {
  let options = await getOptions();
  let mdClipsFolder = '';
  if (options.downloadMode == 'downloadsApi') {
    mdClipsFolder = textReplace(options.mdClipsFolder, article, options.disallowedChars + '/');
    if (mdClipsFolder && !mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
  }
  return mdClipsFolder;
}
async function formatObsidianFolder(article) {
  let options = await getOptions();
  let obsidianFolder = '';
  if (options.imageStyle.startsWith('obsidian') && options.obsidianFolder) {
    obsidianFolder = textReplace(options.obsidianFolder, article, options.disallowedChars + '/');
    if (obsidianFolder && !obsidianFolder.endsWith('/')) obsidianFolder += '/';
  }
  return obsidianFolder;
}

// ---- download-manager.js ----
function downloadListener(id, url) {
  const self = (delta) => {
    if (delta.id === id && delta.state && delta.state.current == "complete") {
      browser.downloads.onChanged.removeListener(self);
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }; return self;
}
async function downloadMarkdown(markdown, title, tabId, imageList = {}, mdClipsFolder = '', forceNoImages = false) {
  const options = await getOptions();
  if (options.downloadMode == 'downloadsApi' && browser.downloads) {
    // Forcer le mode dossier : utiliser downloadFolder au lieu de télécharger à plat
    if (forceNoImages) {
      // Download MD only : PAS d'inserts images, PAS de téléchargement images
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      try {
        if(mdClipsFolder && !mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
        const cleanedTitle = title.replace(/\.md$/, '').replace(/[^a-zA-Z0-9\-_]/g, '_');
        const id = await browser.downloads.download({ url, filename: mdClipsFolder + cleanedTitle + ".md", saveAs: options.saveAs });
        browser.downloads.onChanged.addListener(downloadListener(id, url));
      } catch (err) { console.error("Download failed", err); }
    } else {
      // Download with images : utiliser downloadFolder
      await downloadFolder(markdown, title, tabId, imageList, mdClipsFolder);
    }
  }
}
async function downloadFolder(markdown, title, tabId, imageList = {}, mdClipsFolder = '') {
  console.log('[downloadFolder] Starting with', Object.keys(imageList).length, 'images');
  const options = await getOptions();

  // Create folder name from title (cleaned) and truncate to avoid OS path length issues
  const cleanedTitle = title.replace(/\.md$/, '').replace(/[^a-zA-Z0-9\-_]/g, '_');
  const folderName = cleanedTitle.substring(0, 80);
  const folderPath = (mdClipsFolder ? mdClipsFolder : '') + folderName + '/';

  // Download markdown file (using same cleaned name)
  console.log('[downloadFolder] Creating markdown blob...');
  const mdUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const mdFilename = folderName + '.md';
  console.log('[downloadFolder] Starting markdown download to:', folderPath + mdFilename);
  try {
    const mdId = await browser.downloads.download({
      url: mdUrl,
      filename: folderPath + mdFilename,
      saveAs: false
    });
    console.log('[downloadFolder] Markdown download started:', mdId);
    setTimeout(() => URL.revokeObjectURL(mdUrl), 60000);
  } catch (err) {
    console.error("Markdown download failed", err);
    URL.revokeObjectURL(mdUrl);
    return;
  }
  await Promise.all(Object.entries(imageList).map(async ([src, filename]) => {
    console.log('[downloadFolder] Downloading image:', src.substring(0, 50), '->', filename);
    try {
      const relPath = filename.split('\\').join('/').replace(/^\//, '');
      const imgId = await browser.downloads.download({ url: src, filename: folderPath + 'images/' + relPath, saveAs: false });
      browser.downloads.onChanged.addListener(downloadListener(imgId, src));
      console.log('[downloadFolder] Image download started:', imgId);
    } catch (err) { console.error('[downloadFolder] Failed to download image:', src, err); }
  }));
  console.log('[downloadFolder] All downloads completed');
}
async function downloadZip(markdown, title, tabId, imageList = {}, mdClipsFolder = '') {
  console.log('[downloadZip] Starting with', Object.keys(imageList).length, 'images');
  const options = await getOptions();
  const zipImages = {};
  for (const [src, filename] of Object.entries(imageList)) {
    console.log('[downloadZip] Processing image:', src.substring(0, 50), '->', filename);
    try {
      const result = await fetchImageAsUint8Array(src);
      const relPath = filename.split('\\').join('/').replace(/^\//, '');
      zipImages[relPath] = result;
    } catch (err) { console.warn('[ZIP] Failed to download image:', src, err.message); }
  }
  const zip = new JSZip();
  const folderName = title.replace(/\.md$/, '').replace(/[^a-zA-Z0-9\-_]/g, '_');
  const folder = zip.folder(folderName);
  folder.file(folderName + '.md', markdown);
  console.log('[downloadZip] zipImages count:', Object.keys(zipImages).length);
  for (const [relPath, data] of Object.entries(zipImages)) folder.file(relPath, data);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);
  try {
    await browser.downloads.download({ url: zipUrl, filename: (mdClipsFolder ? mdClipsFolder : '') + folderName + '.zip', saveAs: options.saveAs });
  } catch (err) { console.error("ZIP Download failed", err); URL.revokeObjectURL(zipUrl); throw err; }
  setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
}

// ---- article-extractor.js ----
function extractBetterTitle(dom) {
  // Priorité 1: OpenGraph title (souvent plus propre que <title>)
  const ogTitle = dom.head?.querySelector('meta[property="og:title"]')?.content;
  if (ogTitle && ogTitle.length > 5 && ogTitle.length < 200) {
    return cleanTitleSuffix(ogTitle, dom);
  }

  // Priorité 2: Twitter Card title
  const twitterTitle = dom.head?.querySelector('meta[name="twitter:title"]')?.content;
  if (twitterTitle && twitterTitle.length > 5 && twitterTitle.length < 200) {
    return cleanTitleSuffix(twitterTitle, dom);
  }

  // Priorité 3: <title> HTML avec nettoyage
  const htmlTitle = dom.title;
  if (htmlTitle) {
    return cleanTitleSuffix(htmlTitle, dom);
  }

  // Fallback: premier h1
  const h1 = dom.body?.querySelector('h1');
  if (h1) {
    return h1.textContent.trim();
  }

  return "Untitled";
}

function cleanTitleSuffix(title, dom) {
  // Nettoyer les suffixes courants
  const siteName = dom.head?.querySelector('meta[property="og:site_name"]')?.content;
  const author = dom.head?.querySelector('meta[name="author"]')?.content;

  // Patterns à supprimer
  const patterns = [
    /\s*[—|–|-]\s*(?:by\s+)?[^—|–|-]+$/i, // " — by Author" ou " — Site Name"
    /\s*[—|–|-]\s*$/, // " — " à la fin
    /\s*\|\s*[^|]+$/, // " | Site Name"
    /\s*»\s*[^»]+$/, // " » Site Name"
    new RegExp(`\\s*[—|–|-]\\s*${siteName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), // " — Site Name"
    new RegExp(`\\s*[—|–|-]\\s*by\\s+${author?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), // " — by Author"
  ];

  let cleaned = title;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

async function getArticleFromDom(domString) {
  const parser = new DOMParser();
  const dom = parser.parseFromString(domString, "text/html");
  if (dom.documentElement.nodeName == "parsererror") console.error("error while parsing");
  const math = {};
  const storeMathInfo = (el, mathInfo) => {
    let randomId = URL.createObjectURL(new Blob([]));
    randomId = randomId.substring(randomId.length - 36);
    el.id = randomId; math[randomId] = mathInfo;
  };
  dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach(mathSource => {
    const type = mathSource.attributes.type.value;
    storeMathInfo(mathSource, { tex: mathSource.innerText, inline: type ? !type.includes('mode=display') : false });
  });
  dom.body.querySelectorAll('[markdownload-latex]')?.forEach(mathJax3Node =>  {
    const tex = mathJax3Node.getAttribute('markdownload-latex');
    const display = mathJax3Node.getAttribute('display');
    const inline = !(display && display === 'true');
    const mathNode = document.createElement(inline ? "i" : "p");
    mathNode.textContent = tex;
    mathJax3Node.parentNode.insertBefore(mathNode, mathJax3Node.nextSibling);
    mathJax3Node.parentNode.removeChild(mathJax3Node);
    storeMathInfo(mathNode, { tex, inline });
  });
  dom.body.querySelectorAll('.katex-mathml')?.forEach(kaTeXNode => {
    storeMathInfo(kaTeXNode, { tex: kaTeXNode.querySelector('annotation').textContent, inline: true });
  });
  dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach(codeSource => {
    const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1];
    if (codeSource.firstChild.nodeName == "PRE") codeSource.firstChild.id = `code-lang-${language}`;
  });
  dom.body.querySelectorAll('[class*=language-]')?.forEach(codeSource => {
    const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
    codeSource.id = `code-lang-${language}`;
  });
  dom.body.querySelectorAll('pre br')?.forEach(br => { br.outerHTML = '<br-keep></br-keep>'; });
  dom.body.querySelectorAll('.codehilite > pre')?.forEach(codeSource => {
    if (codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) codeSource.id = `code-lang-text`;
  });
  dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach(header => { header.className = ''; header.outerHTML = header.outerHTML; });
  dom.documentElement.removeAttribute('class');
  const article = new Readability(dom).parse();
  article.baseURI = dom.baseURI; article.pageTitle = extractBetterTitle(dom);
  const url = new URL(dom.baseURI);
  Object.assign(article, { hash: url.hash, host: url.host, origin: url.origin, hostname: url.hostname, pathname: url.pathname, port: url.port, protocol: url.protocol, search: url.search });
  if (dom.head) {
    article.keywords = dom.head.querySelector('meta[name="keywords"]')?.content?.split(',')?.map(s => s.trim());
    dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach(meta => {
      const key = (meta.getAttribute('name') || meta.getAttribute('property'));
      const val = meta.getAttribute('content');
      if (key && val && !article[key]) article[key] = val;
    });
  }
  article.math = math; return article;
}
async function getArticleFromContent(tabId, selection = false) {
  const results = await browser.tabs.executeScript(tabId, { code: "getSelectionAndDom()" });
  if (results && results[0] && results[0].dom) {
    const article = await getArticleFromDom(results[0].dom, selection);
    if (selection && results[0].selection) article.content = results[0].selection;
    return article;
  } else return null;
}

// ---- menu-manager.js ----
async function toggleSetting(setting, options = null) {
  if (options == null) options = await getOptions();
  options[setting] = !options[setting];
  await browser.storage.local.set({ options: options });
  if (setting == "obsidianIntegration") await createMenus();
  return options;
}
async function ensureScripts(tabId) {
  const results = await browser.tabs.executeScript(tabId, { code: "typeof getSelectionAndDom === 'function';" });
  if (!results || !results[0]) await browser.tabs.executeScript(tabId, { file: "content/content.js" });
}
async function createMenus() {
  const options = await getOptions();

  browser.contextMenus.removeAll();

  if (options.contextMenus) {

    // tab menu (chrome does not support this)
    try {
      browser.contextMenus.create({
        id: "download-markdown-tab",
        title: "Download Tab as Markdown",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "tab-download-markdown-alltabs",
        title: "Download All Tabs as Markdown",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "copy-tab-as-markdown-link-tab",
        title: "Copy Tab URL as Markdown Link",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "copy-tab-as-markdown-link-all-tab",
        title: "Copy All Tab URLs as Markdown Link List",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "copy-tab-as-markdown-link-selected-tab",
        title: "Copy Selected Tab URLs as Markdown Link List",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "tab-separator-1",
        type: "separator",
        contexts: ["tab"]
      }, () => { });

      browser.contextMenus.create({
        id: "tabtoggle-includeTemplate",
        type: "checkbox",
        title: "Include front/back template",
        contexts: ["tab"],
        checked: options.includeTemplate
      }, () => { });

      browser.contextMenus.create({
        id: "tabtoggle-downloadImages",
        type: "checkbox",
        title: "Download Images",
        contexts: ["tab"],
        checked: options.downloadImages
      }, () => { });
    } catch {

    }
    // add the download all tabs option to the page context menu as well
    browser.contextMenus.create({
      id: "download-markdown-alltabs",
      title: "Download All Tabs as Markdown",
      contexts: ["all"]
    }, () => { });
    browser.contextMenus.create({
      id: "separator-0",
      type: "separator",
      contexts: ["all"]
    }, () => { });

    // download actions
    browser.contextMenus.create({
      id: "download-markdown-selection",
      title: "Download Selection As Markdown",
      contexts: ["selection"]
    }, () => { });
    browser.contextMenus.create({
      id: "download-markdown-all",
      title: "Download Tab As Markdown",
      contexts: ["all"]
    }, () => { });

    browser.contextMenus.create({
      id: "separator-1",
      type: "separator",
      contexts: ["all"]
    }, () => { });

    // copy to clipboard actions
    browser.contextMenus.create({
      id: "copy-markdown-selection",
      title: "Copy Selection As Markdown",
      contexts: ["selection"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-markdown-link",
      title: "Copy Link As Markdown",
      contexts: ["link"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-markdown-image",
      title: "Copy Image As Markdown",
      contexts: ["image"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-markdown-all",
      title: "Copy Tab As Markdown",
      contexts: ["all"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-tab-as-markdown-link",
      title: "Copy Tab URL as Markdown Link",
      contexts: ["all"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-tab-as-markdown-link-all",
      title: "Copy All Tab URLs as Markdown Link List",
      contexts: ["all"]
    }, () => { });
    browser.contextMenus.create({
      id: "copy-tab-as-markdown-link-selected",
      title: "Copy Selected Tab URLs as Markdown Link List",
      contexts: ["all"]
    }, () => { });

    browser.contextMenus.create({
      id: "separator-2",
      type: "separator",
      contexts: ["all"]
    }, () => { });

    if(options.obsidianIntegration){
      // copy to clipboard actions
      browser.contextMenus.create({
        id: "copy-markdown-obsidian",
        title: "Send Text selection to Obsidian",
        contexts: ["selection"]
      }, () => { });
      browser.contextMenus.create({
        id: "copy-markdown-obsall",
        title: "Send Tab to Obsidian",
        contexts: ["all"]
      }, () => { });
    }
    browser.contextMenus.create({
      id: "separator-3",
      type: "separator",
      contexts: ["all"]
    }, () => { });

    // options
    browser.contextMenus.create({
      id: "toggle-includeTemplate",
      type: "checkbox",
      title: "Include front/back template",
      contexts: ["all"],
      checked: options.includeTemplate
    }, () => { });

    browser.contextMenus.create({
      id: "toggle-downloadImages",
      type: "checkbox",
      title: "Download Images",
      contexts: ["all"],
      checked: options.downloadImages
    }, () => { });
  }
}

// ---- MAIN (background-new.js without imports) ----
// log some info
browser.runtime.getPlatformInfo().then(async platformInfo => {
  const browserInfo = browser.runtime.getBrowserInfo ? await browser.runtime.getBrowserInfo() : "Can't get browser info";
  console.info(platformInfo, browserInfo);
});

browser.runtime.onMessage.addListener(notify);
createMenus();
TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;

async function notify(message) {
  const options = await this.getOptions();
  if (message.type == "clip") {
    const article = await getArticleFromDom(message.dom);
    if (message.selection && message.clipSelection) article.content = message.selection;
    // Affichage dans le popup : PAS d'inserts images (includeImageLinks=false)
    const { markdown, imageList } = await convertArticleToMarkdown(article, false, false, false);
    article.title = await formatTitle(article);
    const mdClipsFolder = await formatMdClipsFolder(article);
    await browser.runtime.sendMessage({ type: "display.md", markdown, article, imageList, mdClipsFolder});
  }
  else if (message.type == "download") {
    // Download MD only : PAS d'inserts images
    // S'assurer que le titre est formaté avec maxTitleLength
    const formattedTitle = generateValidFileName(message.title, null, message.options?.maxTitleLength || 100);
    downloadMarkdown(message.markdown, formattedTitle, message.tab.id, {}, message.mdClipsFolder, true);
  }
  else if (message.type == "downloadZip") {
    console.log('[notify downloadZip] clipSelection:', message.clipSelection);
    await ensureScripts(message.tab.id);
    const article = await getArticleFromContent(message.tab.id, message.clipSelection);
    if (article) {
      // Download with images : AVEC inserts images (includeImageLinks=true)
      const { markdown, imageList } = await convertArticleToMarkdown(article, true, true, true);
      console.log('[notify downloadZip] Got imageList with', Object.keys(imageList).length, 'images');
      const title = await formatTitle(article);
      const mdClipsFolder = await formatMdClipsFolder(article);
      await downloadFolder(markdown, title, message.tab.id, imageList, mdClipsFolder);
    }
  }
}

browser.commands.onCommand.addListener(function (command) {
  const tab = browser.tabs.getCurrent();
  if (command == "download_tab_as_markdown") {
    const info = { menuItemId: "download-markdown-all" };
    downloadMarkdownFromContext(info, tab);
  }
  else if (command == "copy_tab_as_markdown") {
    const info = { menuItemId: "copy-markdown-all" };
    copyMarkdownFromContext(info, tab);
  }
  else if (command == "copy_selection_as_markdown") {
    const info = { menuItemId: "copy-markdown-selection" };
    copyMarkdownFromContext(info, tab);
  }
  else if (command == "copy_tab_as_markdown_link") {
    copyTabAsMarkdownLink(tab);
  }
  else if (command == "copy_selected_tab_as_markdown_link") {
    copySelectedTabAsMarkdownLink(tab);
  }
  else if (command == "copy_selection_to_obsidian") {
    const info = { menuItemId: "copy-markdown-obsidian" };
    copyMarkdownFromContext(info, tab);
  }
  else if (command == "copy_tab_to_obsidian") {
    const info = { menuItemId: "copy-markdown-obsall" };
    copyMarkdownFromContext(info, tab);
  }
});

browser.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId.startsWith("copy-markdown")) copyMarkdownFromContext(info, tab);
  else if (info.menuItemId.startsWith("download-markdown")) downloadMarkdownFromContext(info, tab);
});

async function downloadMarkdownFromContext(info, tab) {
  await ensureScripts(tab.id);
  const article = await getArticleFromContent(tab.id, info.menuItemId == "download-markdown-selection");
  const title = await formatTitle(article);
  const mdClipsFolder = await formatMdClipsFolder(article);
  // Par défaut, PAS d'inserts images (includeImageLinks=false)
  const { markdown, imageList } = await convertArticleToMarkdown(article, false, false, false);
  // Forcer le mode dossier pour tous les téléchargements
  await downloadFolder(markdown, title, tab.id, imageList, mdClipsFolder);
}
async function copyTabAsMarkdownLink(tab) {
  try {
    await ensureScripts(tab.id);
    const article = await getArticleFromContent(tab.id);
    const options = await getOptions();
    const { markdown } = setupTurndown(`<a href="${article.baseURI}">${article.title}</a>`, { ...options, downloadImages: false }, article);
    await browser.tabs.executeScript(tab.id, {code: `copyToClipboard(${JSON.stringify(markdown)})`});
  }
  catch (error) { console.error("Failed to copy text: " + error); }
}
async function copyTabAsMarkdownLinkAll(tab) {
  try {
    const options = await getOptions();
    options.frontmatter = options.backmatter = '';
    const tabs = await browser.tabs.query({ currentWindow: true });
    let markdown = options.frontmatter;
    tabs.forEach(t => { markdown += `- [${t.title}](${t.url})\n`; });
    markdown += options.backmatter;
    await browser.tabs.executeScript(tab.id, {code: `copyToClipboard(${JSON.stringify(markdown)})`});
  }
  catch (error) { console.error("Failed to copy text: " + error); }
}
async function copySelectedTabAsMarkdownLink(tab) {
  try {
    const options = await getOptions();
    options.frontmatter = options.backmatter = '';
    const tabs = await browser.tabs.query({ currentWindow: true, highlighted: true });
    let markdown = options.frontmatter;
    tabs.forEach(t => { markdown += `- [${t.title}](${t.url})\n`; });
    markdown += options.backmatter;
    await browser.tabs.executeScript(tab.id, {code: `copyToClipboard(${JSON.stringify(markdown)})`});
  }
  catch (error) { console.error("Failed to copy text: " + error); }
}
async function copyMarkdownFromContext(info, tab) {
  try{
    await ensureScripts(tab.id);

    const platformOS = navigator.platform;
    var folderSeparator = "";
    if(platformOS.indexOf("Win") === 0){
      folderSeparator = "\\";
    }else{
      folderSeparator = "/";
    }

    if (info.menuItemId == "copy-markdown-link") {
      const options = await getOptions();
      options.frontmatter = options.backmatter = '';
      const article = await getArticleFromContent(tab.id, false);
      const { markdown } = setupTurndown(`<a href="${info.linkUrl}">${info.linkText || info.selectionText}</a>`, { ...options, downloadImages: false }, article);
      await browser.tabs.executeScript(tab.id, {code: `copyToClipboard(${JSON.stringify(markdown)})`});
    }
    else if (info.menuItemId == "copy-markdown-image") {
      await browser.tabs.executeScript(tab.id, {code: `copyToClipboard("![](${info.srcUrl})")`});
    }
    else if(info.menuItemId == "copy-markdown-obsidian") {
      const article = await getArticleFromContent(tab.id, info.menuItemId == "copy-markdown-obsidian");
      const title = await formatTitle(article);
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = await formatObsidianFolder(article);
      // PAS d'inserts images pour copy (includeImageLinks=false)
      const { markdown } = await convertArticleToMarkdown(article, false, false, false);
      await browser.tabs.executeScript(tab.id, { code: `copyToClipboard(${JSON.stringify(markdown)})` });
      await chrome.tabs.update({url: "obsidian://advanced-uri?vault=" + obsidianVault + "&clipboard=true&mode=new&filepath=" + obsidianFolder + generateValidFileName(title)});
    }
    else if(info.menuItemId == "copy-markdown-obsall") {
      const article = await getArticleFromContent(tab.id, info.menuItemId == "copy-markdown-obsall");
      const title = await formatTitle(article);
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = await formatObsidianFolder(article);
      // PAS d'inserts images pour copy (includeImageLinks=false)
      const { markdown } = await convertArticleToMarkdown(article, false, false, false);
      await browser.tabs.executeScript(tab.id, { code: `copyToClipboard(${JSON.stringify(markdown)})` });
      await chrome.tabs.update({url: "obsidian://advanced-uri?vault=" + obsidianVault + "&clipboard=true&mode=new&filepath=" + obsidianFolder + generateValidFileName(title)});
    }
    else {
      const article = await getArticleFromContent(tab.id, info.menuItemId == "copy-markdown-selection");
      // PAS d'inserts images pour copy (includeImageLinks=false)
      const { markdown } = await convertArticleToMarkdown(article, false, false, false);
      await browser.tabs.executeScript(tab.id, { code: `copyToClipboard(${JSON.stringify(markdown)})` });
    }
  }
  catch (error) {
    console.error("Failed to copy text: " + error);
  };
}
async function downloadMarkdownForAllTabs(info) {
  const tabs = await browser.tabs.query({ currentWindow: true });
  tabs.forEach(tab => { downloadMarkdownFromContext(info, tab); });
}
