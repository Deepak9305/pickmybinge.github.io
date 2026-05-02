import fs from 'fs';
import path from 'path';

const DRAFTS_DIR   = path.join(process.cwd(), 'drafts');
const BLOG_DIR     = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX  = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// DRAFT_FILENAME is a relative path like "2026/05/02/keyword-slug.html"
const fileName = process.env.DRAFT_FILENAME;
if (!fileName) {
    console.error('Error: DRAFT_FILENAME env var is required (e.g. 2026/05/02/keyword-slug.html)');
    process.exit(1);
}

const normalizedFileName = fileName.replace(/\\/g, '/');
const parts = normalizedFileName.split('/');
const basename = parts[parts.length - 1];
const relDir   = parts.slice(0, -1).join('/');  // e.g. "2026/05/02"
const slug     = basename.replace(/\.(html|json)$/, '');

// Derive date-prefixed ID from folder structure (YYYY/MM/DD/slug → YYYY-MM-DD-slug)
const dateParts = relDir.split('/').slice(-3);
const fileId = dateParts.length === 3
    ? `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}-${slug}`
    : slug;

const draftPath = path.join(DRAFTS_DIR, normalizedFileName);
if (!fs.existsSync(draftPath)) {
    console.error(`Error: Draft not found at ${draftPath}`);
    process.exit(1);
}

const destDir  = path.join(BLOG_DIR, relDir);
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const isHtml = basename.endsWith('.html');
let entry;

if (isHtml) {
    const text = fs.readFileSync(draftPath, 'utf-8');
    fs.writeFileSync(path.join(destDir, basename), text);
    console.log(`✅ Published: public/content/blogs/${normalizedFileName}`);

    const getMeta = (name, isProp = false) => {
        const attr = isProp ? 'property' : 'name';
        const m = text.match(new RegExp(`<meta ${attr}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)"`));
        return m ? m[1] : '';
    };

    const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const title     = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : fileId;
    const id        = getMeta('id') || fileId;
    const date      = getMeta('date');
    const category  = getMeta('category') || 'general';
    const excerpt   = getMeta('description');
    const thumbnail = getMeta('og:image', true) || null;
    const tmdbIdsRaw = getMeta('tmdb-ids');
    const tmdb_ids  = tmdbIdsRaw ? tmdbIdsRaw.split(',').map(Number).filter(Boolean) : [];

    entry = { id, date, title, category, excerpt, thumbnail: thumbnail || null, tmdb_ids, link: `/blog.html?id=${id}` };
} else {
    const post = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
    fs.writeFileSync(path.join(destDir, basename), JSON.stringify(post, null, 4));
    console.log(`✅ Published: public/content/blogs/${normalizedFileName}`);
    const thumbMatch = (post.content || '').match(/src="(https:\/\/image\.tmdb\.org\/[^"]+)"/);
    entry = {
        id: post.id,
        date: post.date,
        title: post.title,
        category: post.category,
        excerpt: post.excerpt,
        thumbnail: post.thumbnail || (thumbMatch ? thumbMatch[1] : null),
        tmdb_ids: post.tmdb_ids,
        link: post.link
    };
}

// Update manifest (stores relative paths like "2026/05/02/slug.html")
let manifest = [];
if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch { }
    if (!Array.isArray(manifest)) manifest = [];
}
if (!manifest.includes(normalizedFileName)) {
    manifest.unshift(normalizedFileName);
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log('✅ manifest.json updated.');
}

// Update blogs-index.json
let index = [];
if (fs.existsSync(BLOGS_INDEX)) {
    try { index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')); } catch { }
}
index = index.filter(p => p.id !== entry.id);
index.unshift(entry);
fs.writeFileSync(BLOGS_INDEX, JSON.stringify(index, null, 4));
console.log(`✅ blogs-index.json updated (${index.length} entries).`);
