/**
 * scan-blog.js — PickMyBinge Blog Integrity Auditor
 *
 * Audits all published blog posts in public/content/blogs for:
 *   - Valid HTML or JSON structure
 *   - Required fields (id, title, excerpt, content, date)
 *   - Minimum word count (700 words)
 *   - Presence of <img> tags in content
 *   - No broken/placeholder TMDB links
 *   - HTML structure integrity (unclosed tags check)
 *
 * Usage: node scripts/scan-blog.js
 * Exit code 1 if any issues found, 0 if all clean.
 */

import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');
const MIN_WORDS = 500;
const MAX_TITLE_LENGTH = 80;
const MAX_EXCERPT_LENGTH = 170;

const REQUIRED_FIELDS = ['id', 'title', 'excerpt', 'content', 'date', 'category'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(html) {
    return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

function findUnclosedTags(html) {
    const tagStack = [];
    const voidTags = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'source', 'track', 'wbr']);
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const full = match[0];
        const tag = match[1].toLowerCase();
        if (voidTags.has(tag)) continue;
        if (full.startsWith('</')) {
            if (tagStack[tagStack.length - 1] === tag) tagStack.pop();
        } else if (!full.endsWith('/>')) {
            tagStack.push(tag);
        }
    }
    return tagStack;
}

function hasPlaceholderImages(html) {
    return /src="(|placeholder|#|https?:\/\/via\.placeholder|https?:\/\/placehold)"/i.test(html);
}

function hasTMDBLinks(html) {
    return html.includes('themoviedb.org');
}

function hasBrokenTMDBLinks(html) {
    // Detect raw TMDB IDs without proper links (common hallucination artifact)
    return /themoviedb\.org\/(?:movie|tv)\/(?:undefined|null|NaN|0)\b/.test(html);
}

function extractMeta(html, name, isProperty = false) {
    const attr = isProperty ? 'property' : 'name';
    const pattern = new RegExp(`<meta\\s+${attr}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content="([^"]*)"`, 'i');
    const match = html.match(pattern);
    return match ? match[1] : '';
}

function extractContent(html) {
    const blogContentMatch = html.match(/<div[^>]*class="[^"]*\bblog-post-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (blogContentMatch) return blogContentMatch[1].trim();

    const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) return articleMatch[1].trim();

    const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    return mainMatch ? mainMatch[1].trim() : '';
}

function normalizeDateValue(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
}

function extractPublishedDate(html) {
    const metaDate = extractMeta(html, 'date') || extractMeta(html, 'article:published_time', true);
    const normalizedMetaDate = normalizeDateValue(metaDate);
    if (normalizedMetaDate) return normalizedMetaDate;

    const textDateMatch = html.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{1,2}, \d{4}\b/);
    return normalizeDateValue(textDateMatch ? textDateMatch[0] : '');
}

function parseHtmlPost(raw, fileName) {
    const titleMatch = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
        : raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s*\|.*/, '').trim() || path.basename(fileName, path.extname(fileName));

    return {
        id: extractMeta(raw, 'id') || path.basename(fileName, path.extname(fileName)),
        title,
        excerpt: extractMeta(raw, 'description'),
        content: extractContent(raw),
        date: extractPublishedDate(raw),
        category: extractMeta(raw, 'category') || 'general',
        thumbnail: extractMeta(raw, 'og:image', true) || '',
        tmdb_ids: extractMeta(raw, 'tmdb-ids')
            .split(',')
            .map((id) => Number(id))
            .filter(Boolean)
    };
}

function parsePublishedPost(raw, filePath) {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
        return parseHtmlPost(raw, path.basename(filePath));
    }

    const post = JSON.parse(raw);
    return {
        ...post,
        id: post.id || path.basename(filePath, path.extname(filePath))
    };
}

// ─── Audit ────────────────────────────────────────────────────────────────────

function auditPost(filePath) {
    const fileName = path.basename(filePath);
    const issues = [];

    let post;
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        post = parsePublishedPost(raw, filePath);
    } catch (e) {
        return { file: fileName, issues: [`❌ Invalid JSON: ${e.message}`], pass: false };
    }

    // Required fields
    REQUIRED_FIELDS.forEach(field => {
        if (!post[field]) issues.push(`Missing required field: "${field}"`);
    });

    if (!post.content) {
        return { file: fileName, issues: issues.length ? issues : ['Missing content'], pass: false };
    }

    // Word count
    const wordCount = countWords(post.content);
    if (wordCount < MIN_WORDS) {
        issues.push(`Word count too low: ${wordCount} words (min: ${MIN_WORDS})`);
    }

    // Image presence
    const imgCount = (post.content.match(/<img\b/gi) || []).length;
    if (imgCount === 0) {
        issues.push('No <img> tags found in content');
    }

    // Placeholder images
    if (hasPlaceholderImages(post.content)) {
        issues.push('Placeholder image URL detected in content');
    }

    // TMDB references
    const hasTmdbReference = hasTMDBLinks(post.content)
        || /image\.tmdb\.org/.test(post.content || '')
        || /image\.tmdb\.org/.test(post.thumbnail || '')
        || (Array.isArray(post.tmdb_ids) && post.tmdb_ids.length > 0);
    if (!hasTmdbReference) {
        issues.push('No TMDB references found (expected metadata, links, or images)');
    }

    // Broken TMDB links
    if (hasBrokenTMDBLinks(post.content)) {
        issues.push('Broken TMDB link detected (undefined/null ID)');
    }

    // Unclosed HTML tags
    const unclosed = findUnclosedTags(post.content);
    if (unclosed.length > 0) {
        issues.push(`Unclosed HTML tags: ${unclosed.join(', ')}`);
    }

    // Excerpt length
    if (post.excerpt && post.excerpt.length > MAX_EXCERPT_LENGTH) {
        issues.push(`Excerpt too long: ${post.excerpt.length} chars (max: ${MAX_EXCERPT_LENGTH})`);
    }

    // Title length
    if (post.title && post.title.length > MAX_TITLE_LENGTH) {
        issues.push(`Title too long: ${post.title.length} chars (max: ${MAX_TITLE_LENGTH})`);
    }

    const pass = issues.length === 0;
    return { file: fileName, wordCount, imgCount, issues, pass };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    console.log('\n🔍 PickMyBinge Blog Integrity Scanner');
    console.log(`   Scanning: ${BLOG_DIR}\n`);

    if (!fs.existsSync(BLOG_DIR)) {
        console.error(`❌ Blog directory not found: ${BLOG_DIR}`);
        process.exit(1);
    }

    // Collect all published post files recursively (exclude manifest.json)
    const files = fs.readdirSync(BLOG_DIR, { recursive: true })
        .map(f => f.toString())
        .filter(f => /\.(html|json)$/i.test(f) && path.basename(f) !== 'manifest.json')
        .map(f => path.join(BLOG_DIR, f))
        .sort();

    if (files.length === 0) {
        console.log('  No blog posts found.');
        process.exit(0);
    }

    console.log(`  Found ${files.length} post(s).\n${'─'.repeat(60)}`);

    let passCount = 0;
    let failCount = 0;
    const failedFiles = [];

    files.forEach(filePath => {
        const result = auditPost(filePath);
        if (result.pass) {
            console.log(`  ✅ ${result.file} (${result.wordCount} words, ${result.imgCount} img${result.imgCount !== 1 ? 's' : ''})`);
            passCount++;
        } else {
            console.log(`  ❌ ${result.file}`);
            result.issues.forEach(issue => console.log(`       ⚠  ${issue}`));
            failCount++;
            failedFiles.push(result.file);
        }
    });

    // Manifest sync check
    if (fs.existsSync(MANIFEST_PATH)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
            const actualFiles = files.map(f => path.basename(f));
            const manifestBases = manifest.map(f => path.basename(f.toString()));
            const orphaned = manifestBases.filter(f => !actualFiles.includes(f));
            const untracked = actualFiles.filter(f => !manifestBases.includes(f));
            if (orphaned.length > 0) {
                console.log(`\n  ⚠  Orphaned manifest entries: ${orphaned.join(', ')}`);
            }
            if (untracked.length > 0) {
                console.log(`\n  ⚠  Untracked posts (not in manifest): ${untracked.join(', ')}`);
            }
        } catch {
            console.log('\n  ⚠  manifest.json could not be parsed.');
        }
    } else {
        console.log('\n  ⚠  manifest.json not found.');
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Results: ${passCount} passed, ${failCount} failed\n`);

    if (failCount > 0) {
        console.error(`  Failed posts:\n${failedFiles.map(f => `    - ${f}`).join('\n')}\n`);
        process.exit(1);
    } else {
        console.log('  🎉 All posts passed integrity check!\n');
        process.exit(0);
    }
}

main();
