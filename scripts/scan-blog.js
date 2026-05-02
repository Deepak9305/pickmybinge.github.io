/**
 * scan-blog.js — PickMyBinge Blog Integrity Auditor
 *
 * Audits all JSON blog posts in public/content/blogs for:
 *   - Valid JSON structure
 *   - Required fields (id, title, excerpt, content, date)
 *   - Minimum word count (1200 words)
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
const MIN_WORDS = 1200;

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

// ─── Audit ────────────────────────────────────────────────────────────────────

function auditPost(filePath) {
    const fileName = path.basename(filePath);
    const issues = [];

    let post;
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        post = JSON.parse(raw);
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

    // TMDB links
    if (!hasTMDBLinks(post.content)) {
        issues.push('No TMDB links found (expected at least one)');
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
    if (post.excerpt && post.excerpt.length > 160) {
        issues.push(`Excerpt too long: ${post.excerpt.length} chars (max: 160)`);
    }

    // Title length
    if (post.title && post.title.length > 70) {
        issues.push(`Title too long: ${post.title.length} chars (max: 70)`);
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

    // Collect all JSON post files recursively (exclude manifest.json)
    const files = fs.readdirSync(BLOG_DIR, { recursive: true })
        .map(f => f.toString())
        .filter(f => f.endsWith('.json') && path.basename(f) !== 'manifest.json')
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
