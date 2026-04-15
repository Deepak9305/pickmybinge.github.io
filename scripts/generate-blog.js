import fs from 'fs';
import path from 'path';

/**
 * Autonomous Blog Generation Pipeline v2
 * - Richer TMDB data (cast, genres, tagline, runtime)
 * - Upgraded model: llama-3.3-70b-versatile
 * - Longer, structured prompts (1200+ words enforced)
 * - Auto-publishes to blogs-index.json and public/content/blogs/
 * - Correct YYYY-MM-DD date in filenames
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const DRAFTS_DIR = path.join(process.cwd(), 'public/content/1st draft');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// ─── Groq Helpers ─────────────────────────────────────────────────────────────

async function callGroq(model, prompt) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing from environment.');
    console.log(`  → Calling Groq (${model})...`);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.72,
            max_tokens: 4096
        })
    });
    const data = await response.json();
    if (data.error) {
        console.error('Groq Error:', JSON.stringify(data.error));
        throw new Error(`Groq API Error: ${data.error.message}`);
    }
    return data.choices[0].message.content;
}

async function callGroqWithRetry(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await callGroq(model, prompt);
        } catch (e) {
            console.error(`  Attempt ${i + 1} failed: ${e.message}`);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        }
    }
}

// ─── TMDB Helpers ─────────────────────────────────────────────────────────────

async function fetchFromTMDB(endpoint, params = {}) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is missing from environment.');
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const sanitized = url.toString().replace(TMDB_API_KEY, 'REDACTED');
    console.log(`  → TMDB: ${sanitized}`);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status} for ${endpoint}`);
    return res.json();
}

/**
 * Fetch full details + credits for a single TMDB item.
 * Returns enriched object with cast, genres, tagline, runtime.
 */
async function fetchEnrichedItem(id, type) {
    const [details, credits] = await Promise.all([
        fetchFromTMDB(`${type}/${id}`, { append_to_response: 'keywords' }),
        fetchFromTMDB(`${type}/${id}/credits`)
    ]);

    const topCast = (credits.cast || [])
        .slice(0, 3)
        .map(a => a.name);

    const genres = (details.genres || []).map(g => g.name);

    return {
        id,
        type,
        title: details.title || details.name,
        tagline: details.tagline || '',
        overview: details.overview || '',
        release_date: details.release_date || details.first_air_date || '',
        rating: details.vote_average ? details.vote_average.toFixed(1) : 'N/A',
        runtime: details.runtime
            ? `${details.runtime} min`
            : details.number_of_seasons
                ? `${details.number_of_seasons} season(s)`
                : 'N/A',
        genres,
        cast: topCast,
        poster: details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
            : null,
        tmdb_link: `https://www.themoviedb.org/${type}/${id}`
    };
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

/**
 * Robustly parses a JSON object that may contain literal (unescaped) newlines,
 * carriage returns, or tabs inside string values — a common LLM output artifact.
 *
 * Strategy: walk character-by-character; when inside a JSON string, replace any
 * raw control character with its proper JSON escape sequence. Already-escaped
 * sequences (e.g. the two characters `\` + `n`) are left completely untouched.
 */
function sanitizeJsonString(raw) {
    let result = '';
    let inString = false;
    let i = 0;
    while (i < raw.length) {
        const ch = raw[i];
        if (inString) {
            if (ch === '\\') {
                // Consume the escape sequence as-is (e.g. \n, \", \\, \uXXXX)
                result += ch + (raw[i + 1] || '');
                i += 2;
                continue;
            } else if (ch === '"') {
                inString = false;
                result += ch;
            } else if (ch === '\n') {
                result += '\\n';
            } else if (ch === '\r') {
                result += '\\r';
            } else if (ch === '\t') {
                result += '\\t';
            } else if (ch < ' ') {
                // Other control characters: drop them silently
            } else {
                result += ch;
            }
        } else {
            if (ch === '"') inString = true;
            result += ch;
        }
        i++;
    }
    return result;
}

function parseJson(str) {
    try {
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('No JSON object found');
        const clean = sanitizeJsonString(str.substring(start, end + 1));
        return JSON.parse(clean);
    } catch (e) {
        console.error('Failed to parse JSON. Raw snippet:', str.substring(0, 600));
        throw new Error(`JSON Parse Error: ${e.message}`);
    }
}

// ─── Index Helpers ────────────────────────────────────────────────────────────

function updateBlogsIndex(newEntry) {
    let index = [];
    if (fs.existsSync(BLOGS_INDEX)) {
        try { index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')); } catch { }
    }
    // Remove any existing entry with the same id, then prepend
    index = index.filter(p => p.id !== newEntry.id);
    index.unshift(newEntry);
    fs.writeFileSync(BLOGS_INDEX, JSON.stringify(index, null, 4));
    console.log(`  → blogs-index.json updated (${index.length} entries).`);
}

function updateManifest(fileName) {
    let manifest = [];
    if (fs.existsSync(MANIFEST_PATH)) {
        try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch { }
    }
    if (!manifest.includes(fileName)) {
        manifest.unshift(fileName);
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        console.log(`  → manifest.json updated.`);
    }
}

function estimateReadTime(content) {
    const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline(nicheHint = 'Sci-Fi Thrillers') {
    const MODEL = 'llama-3.3-70b-versatile';

    try {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  Pipeline: ${nicheHint}`);
        console.log(`${'─'.repeat(60)}`);

        [BLOG_DIR, DRAFTS_DIR].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });

        // ── STEP 1: Discover titles from TMDB ────────────────────────────────
        console.log('\n[STEP 1] Discovering titles from TMDB...');
        const currentYear = new Date().getFullYear();
        let discoverData;

        if (nicheHint === 'K-Dramas') {
            discoverData = await fetchFromTMDB('discover/tv', {
                first_air_date_year: currentYear - 1,
                with_original_language: 'ko',
                sort_by: 'popularity.desc'
            });
        } else {
            discoverData = await fetchFromTMDB('discover/movie', {
                primary_release_year: currentYear,
                with_genres: '878,53',
                sort_by: 'popularity.desc'
            });
        }

        const topResults = discoverData.results.slice(0, 5);
        if (topResults.length === 0) throw new Error('No content found on TMDB.');

        // ── STEP 2: Enrich each title with full details ───────────────────────
        console.log('\n[STEP 2] Fetching enriched details for each title...');
        const itemType = nicheHint === 'K-Dramas' ? 'tv' : 'movie';
        const enrichedContent = await Promise.all(
            topResults.map(item => fetchEnrichedItem(item.id, itemType))
        );
        console.log(`  → Enriched ${enrichedContent.length} titles.`);

        const category = nicheHint === 'K-Dramas' ? 'korean' : 'movies';
        const nicheLabel = nicheHint === 'K-Dramas' ? 'K-Drama' : 'Sci-Fi Thriller';

        // ── STEP 3: AI Writing pass ───────────────────────────────────────────
        console.log('\n[STEP 3] Generating article (writing pass)...');

        const writingPrompt = `You are the Lead Editor at PickMyBinge, a premium entertainment blog. Write a viral, deeply researched ${nicheLabel} feature article.

SOURCE DATA (you MUST use all 5 titles, do not invent others):
${JSON.stringify(enrichedContent, null, 2)}

ARTICLE STRUCTURE — follow this exactly:
1. HOOK introduction (2-3 punchy paragraphs). NO generic "In the world of cinema..." openers.
2. For EACH of the 5 titles, a deep-dive section with:
   - <h2> heading containing the title and release year (link to tmdb_link)
   - <img src="[poster URL from data]" alt="[title] poster" class="blog-image"> — REQUIRED for every title. Use the exact poster URL from the source data. Do NOT skip or use placeholder text.
   - Cast callout: "Starring [cast names]"
   - Tagline in an HTML <blockquote>
   - 3–4 paragraphs: plot analysis, what makes it special, themes, why PickMyBinge readers will love it
   - A <span class="verdict-badge">PickMyBinge Verdict: X/10</span> rating
3. A "PickMyBinge Quick Picks" HTML <table> summarising all 5 titles (columns: Title, Genre, Rating, Must-Watch Factor)
4. A "Watch If You Liked" section with 2-3 similar recommendations
5. A CTA paragraph: "Ready to find your next binge?" linking to https://www.pickmybinge.com

RULES:
- Output ONLY a JSON object with exactly these keys: "title", "excerpt", "content"
- "title": catchy SEO headline (max 70 chars)
- "excerpt": 1-2 sentence hook (max 160 chars, good for meta description)
- "content": the full article as a single HTML string (NO <html>/<body>/<style> tags)
- NO inline CSS or style attributes anywhere
- Minimum 1200 words in the article body
- All <img> tags must use the real poster URLs from the source data
- Enthusiastic yet authoritative tone`;

        const draftRaw = await callGroqWithRetry(MODEL, writingPrompt);
        const draft = parseJson(draftRaw);

        // ── STEP 4: Hostile editorial refinement ──────────────────────────────
        console.log('\n[STEP 4] Refining article (hostile editor pass)...');

        const refinerPrompt = `You are a Hostile Senior Editor at PickMyBinge. Critically audit this draft article and return the polished version.

DRAFT:
${JSON.stringify(draft)}

SOURCE TITLES TO VERIFY AGAINST:
${JSON.stringify(enrichedContent.map(t => ({ title: t.title, poster: t.poster, cast: t.cast, tmdb_link: t.tmdb_link })))}

YOUR CHECKLIST — fix every issue you find:
1. Hook: Is the opening NON-GENERIC? If it starts with "In the world of..." or "As we step into...", rewrite it completely.
2. Coverage: Are ALL 5 titles covered with deep-dive <h2> sections? Add any that are missing.
3. Images: Does EVERY title section have an <img class="blog-image" src="[real URL]">? If any is missing or uses placeholder text, add it using the poster URL from SOURCE TITLES.
4. Verdict badges: Is <span class="verdict-badge"> present for every title? Add if missing.
5. Table: Is the Quick Picks <table> present and correctly formatted?
6. Length: Is the article at least 1200 words? If short, expand plot analyses and themes.
7. Tone: Remove any AI-sounding filler phrases ("It's worth noting", "In conclusion", "Dive into").
8. SEO: Ensure the title is punchy and under 70 chars. Ensure the excerpt is under 160 chars.

Return ONLY the corrected JSON object with keys: "title", "excerpt", "content". Output ONLY the JSON, no explanation.`;

        const polishedRaw = await callGroqWithRetry(MODEL, refinerPrompt);
        const finalPost = parseJson(polishedRaw);

        // Validation
        const missing = ['title', 'excerpt', 'content'].filter(k => !finalPost[k]);
        if (missing.length > 0) throw new Error(`Polished post missing fields: ${missing.join(', ')}`);

        // ── STEP 5: Build and save ────────────────────────────────────────────
        console.log('\n[STEP 5] Saving files...');
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        const slug = nicheHint.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileId = `${formattedDate}-${slug}`;
        const fileName = `${fileId}.json`;

        const tags = nicheHint === 'K-Dramas'
            ? ['k-drama', 'korean', 'tv-shows', 'streaming']
            : ['sci-fi', 'thriller', 'movies', 'action'];

        const newPost = {
            id: fileId,
            date: `${year}-${month}-${day}`,
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            category,
            tags,
            readTimeMinutes: estimateReadTime(finalPost.content),
            content: finalPost.content,
            link: `/blog.html?id=${fileId}`
        };

        // Save to draft folder
        const draftPath = path.join(DRAFTS_DIR, fileName);
        fs.writeFileSync(draftPath, JSON.stringify(newPost, null, 4));
        console.log(`  → Draft saved: public/content/1st draft/${fileName}`);

        // Save to live blogs folder
        const livePath = path.join(BLOG_DIR, fileName);
        fs.writeFileSync(livePath, JSON.stringify(newPost, null, 4));
        console.log(`  → Live post saved: public/content/blogs/${fileName}`);

        // Update manifest
        updateManifest(fileName);

        // Update blogs-index.json (index entry is lightweight — no content field)
        const indexEntry = {
            id: fileId,
            date: newPost.date,
            title: newPost.title,
            category,
            excerpt: newPost.excerpt,
            link: newPost.link
        };
        updateBlogsIndex(indexEntry);

        console.log(`\n✅ Pipeline complete: ${fileId}`);
        return true;

    } catch (error) {
        console.error(`\n❌ Pipeline failed for "${nicheHint}":`, error.message);
        if (error.cause) console.error('   Cause:', error.cause);
        return false;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const niches = ['Sci-Fi Thrillers', 'K-Dramas'];
    console.log(`\nPickMyBinge Blog Pipeline v2`);
    console.log(`Generating posts for: ${niches.join(', ')}\n`);

    const results = [];
    for (const niche of niches) {
        const ok = await runPipeline(niche);
        results.push({ niche, ok });
        if (niches.indexOf(niche) < niches.length - 1) {
            console.log('\nPausing 3s before next niche...');
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    console.log('\n─── Final Results ───');
    results.forEach(({ niche, ok }) => {
        console.log(`  ${ok ? '✅' : '❌'} ${niche}`);
    });
    console.log('─────────────────────\n');

    const anyFailed = results.some(r => !r.ok);
    process.exit(anyFailed ? 1 : 0);
}

main();
