import fs from 'fs';
import path from 'path';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const DRAFTS_DIR = path.join(process.cwd(), 'drafts');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// ─── Groq Helpers ─────────────────────────────────────────────────────────────

async function callGroq(model, prompt, maxTokens = 8000) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing from environment.');
    console.log(`  → Calling Groq (${model}, max_tokens=${maxTokens})...`);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
        })
    });
    const data = await response.json();
    if (data.error) {
        console.error('Groq Error:', JSON.stringify(data.error));
        throw new Error(`Groq API Error: ${data.error.message}`);
    }
    return data.choices[0].message.content;
}

async function callGroqWithRetry(model, prompt, retries = 3, maxTokens = 8000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await callGroq(model, prompt, maxTokens);
        } catch (e) {
            console.error(`  Attempt ${i + 1} failed: ${e.message}`);
            if (i === retries - 1) throw e;
            const match = e.message.match(/try again in ([\d.]+)s/i);
            const waitMs = match
                ? Math.ceil(parseFloat(match[1]) * 1000) + 2000
                : 60000;
            console.log(`  ⏳ Rate limit — waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
            await new Promise(r => setTimeout(r, waitMs));
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

async function fetchEnrichedItem(id, type) {
    const [details, credits] = await Promise.all([
        fetchFromTMDB(`${type}/${id}`, { append_to_response: 'keywords' }),
        fetchFromTMDB(`${type}/${id}/credits`)
    ]);

    const topCast = (credits.cast || []).slice(0, 3).map(a => a.name);
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

function sanitizeJsonString(raw) {
    let result = '';
    let inString = false;
    let i = 0;
    while (i < raw.length) {
        const ch = raw[i];
        if (inString) {
            if (ch === '\\') {
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
                // drop other control characters
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

// ─── HTML Post-Processing ─────────────────────────────────────────────────────

function cleanHtml(html) {
    let out = html;

    out = out.replace(
        /<p[^>]*>\s*(In the world of|As we step into|Welcome to the world of|In today's|It's no secret that)[^<]*<\/p>/gi,
        ''
    );

    const fillerPhrases = [
        /It'?s worth noting that\s*/gi,
        /In conclusion[,.]?\s*/gi,
        /To summarize[,.]?\s*/gi,
        /Dive into\s*/gi,
        /Without further ado[,.]?\s*/gi,
        /At the end of the day[,.]?\s*/gi,
        /Needless to say[,.]?\s*/gi,
        /I'?m not going to lie[,.]?\s*/gi,
    ];
    fillerPhrases.forEach(re => { out = out.replace(re, ''); });

    out = out.replace(/<img\b(?![^>]*loading=)/gi, '<img loading="lazy"');
    out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');
    out = out.replace(/\s*style="[^"]*"/gi, '');

    return out.trim();
}

// ─── HTML Draft Builder ───────────────────────────────────────────────────────

function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildHtmlDraft(post) {
    const tmdbIds = (post.tmdb_ids || []).join(',');
    const tags = (post.tags || []).join(',');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeAttr(post.title)} | PickMyBinge</title>
  <meta name="description" content="${escapeAttr(post.excerpt)}">
  <meta name="date" content="${post.date}">
  <meta name="category" content="${post.category}">
  <meta name="tags" content="${escapeAttr(tags)}">
  <meta name="id" content="${post.id}">
  <meta name="read-time" content="${post.readTimeMinutes}">
  <meta name="persona" content="">
  <meta name="tmdb-ids" content="${tmdbIds}">
  <meta property="og:image" content="${escapeAttr(post.thumbnail || '')}">
</head>
<body>
<article>
  <h1>${post.title}</h1>
  <div class="blog-post-content">
${post.content}
  </div>
</article>
</body>
</html>`;
}

// ─── Dedup Helpers ────────────────────────────────────────────────────────────

function getUsedTmdbIds() {
    const used = new Set();
    if (!fs.existsSync(BLOGS_INDEX)) return used;
    try {
        const index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8'));
        for (const entry of index) {
            if (Array.isArray(entry.tmdb_ids)) {
                entry.tmdb_ids.forEach(id => used.add(id));
            }
        }
    } catch { }
    return used;
}

function estimateReadTime(content) {
    const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

function getUsedDraftSlugs() {
    const used = new Set();
    if (fs.existsSync(MANIFEST_PATH)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
            for (const f of manifest)
                used.add(f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(json|html)$/, ''));
        } catch {}
    }
    if (fs.existsSync(DRAFTS_DIR)) {
        for (const f of fs.readdirSync(DRAFTS_DIR))
            if (f.endsWith('.html') || f.endsWith('.json'))
                used.add(f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(json|html)$/, ''));
    }
    return used;
}

// ─── Step 1: Keyword Research ─────────────────────────────────────────────────

async function researchKeyword() {
    const usedSlugs = getUsedDraftSlugs();
    console.log(`\n[STEP 1] Researching keyword (${usedSlugs.size} slugs already used)...`);

    const usedList = usedSlugs.size > 0 ? [...usedSlugs].join(', ') : 'none yet';

    const prompt = `You are an SEO content strategist for PickMyBinge, a movie and TV show recommendation blog.

Generate 8 keyword opportunities for blog posts. Each keyword must be:
- Mid to high search volume (thousands of monthly searches)
- Low competition (not dominated by major publishers like IMDb, Screen Rant, or Wikipedia)
- Specifically about movies or TV shows — audience questions, debates, explanations, rankings
- In formats like: "why did [character] [action]", "best [genre] movies on [platform]", "is [title] worth watching", "[title] ending explained", "how powerful is [character]", "[title] vs [title]", "[title] season [N] explained"

Already covered slugs to avoid repeating: ${usedList}

Return JSON only:
{
  "keywords": [
    {
      "keyword": "the exact search query to target",
      "slug": "kebab-case-slug-of-keyword",
      "franchise": "primary show or movie name to search on TMDB for images",
      "category": "movies or tv",
      "rationale": "why this has volume and low competition"
    }
  ]
}`;

    const raw = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', prompt, 3, 2000);
    const parsed = parseJson(raw);
    const keywords = parsed.keywords || [];

    if (keywords.length === 0) throw new Error('Keyword research returned no candidates.');

    const fresh = keywords.filter(k => k.slug && !usedSlugs.has(k.slug));
    const chosen = fresh.length > 0 ? fresh[0] : keywords[0];
    console.log(`  → Chosen: "${chosen.keyword}" | slug: ${chosen.slug} | franchise: ${chosen.franchise}`);
    return chosen;
}

// ─── Step 2: TMDB Images ──────────────────────────────────────────────────────

async function fetchTmdbImages(franchise) {
    if (!TMDB_API_KEY) { console.log('\n[STEP 2] TMDB_API_KEY not set — skipping images.'); return null; }
    try {
        console.log(`\n[STEP 2] Fetching TMDB images for "${franchise}"...`);
        const searchRes = await fetchFromTMDB('search/multi', { query: franchise, language: 'en-US', page: 1 });
        const match = (searchRes.results || []).find(r =>
            (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
        );
        if (!match) { console.log('  → No TMDB match — continuing without images.'); return null; }

        const { id, media_type } = match;
        const title = match.title || match.name;
        console.log(`  → Matched: ${title} (${media_type}/${id})`);

        const imagesRes = await fetchFromTMDB(`${media_type}/${id}/images`);
        const backdrops = (imagesRes.backdrops || []).slice(0, 3);
        const posters   = (imagesRes.posters   || []).slice(0, 4);

        const inContent = backdrops.map(b => ({
            url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
            alt: `${title} scene`
        }));
        if (inContent.length < 3 && posters.length > 1) {
            inContent.push(...posters.slice(1, 3 - inContent.length + 1).map(p => ({
                url: `https://image.tmdb.org/t/p/w500${p.file_path}`,
                alt: `${title} poster`
            })));
        }

        const thumbnail = posters.length > 0 ? `https://image.tmdb.org/t/p/w500${posters[0].file_path}` : null;
        console.log(`  → ${inContent.length} content image(s), thumbnail: ${thumbnail ? 'yes' : 'none'}`);
        return { tmdbId: id, mediaType: media_type, title, thumbnail, inContent };
    } catch (e) {
        console.log(`  → TMDB fetch failed: ${e.message} — continuing without images.`);
        return null;
    }
}

// ─── Step 3: Blog Writing ─────────────────────────────────────────────────────

async function generateBlog(keyword, tmdbResult) {
    console.log(`\n[STEP 3] Writing blog for: "${keyword.keyword}"...`);

    if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `${formattedDate}-${keyword.slug}.html`;
    const fileId   = `${formattedDate}-${keyword.slug}`;

    if (fs.existsSync(path.join(DRAFTS_DIR, fileName))) {
        console.log(`  ℹ️  Draft already exists — skipping: ${fileName}`);
        return;
    }

    const imageBlock = tmdbResult && tmdbResult.inContent.length > 0
        ? `\nTMDB REFERENCE IMAGES — embed these after relevant <h2> sections using this exact HTML:\n<img loading="lazy" src="[URL]" alt="[alt]" class="blog-image">\n\n${tmdbResult.inContent.map(img => `URL: ${img.url}\nAlt: ${img.alt}`).join('\n\n')}\n`
        : '';

    const writingPrompt = `You are writing a blog post for PickMyBinge, a movie and TV recommendation site.

Target keyword: "${keyword.keyword}"

Write a high-quality, engaging blog post of approximately 800 words optimised for this search query. Requirements:
- Open with a hook that directly addresses the search intent — no generic introductions
- Use 3-5 <h2> sections to structure the content
- Write in a conversational, fan-friendly tone — not academic, not press-release-style
- Include specific details: character names, episode references, plot points
- Do NOT start paragraphs with "In the world of", "It's no secret", or similar AI filler
- Do NOT write a conclusion starting with "In conclusion" or "To summarize"
- Do NOT add a sign-off or call-to-action at the end
${imageBlock}

Return JSON only — no markdown, no code fences:
{
  "title": "SEO title under 70 characters that includes the target keyword",
  "excerpt": "Meta description under 160 characters summarising the post",
  "content": "<HTML article body using only h2, p, ul, li, strong, em, and img tags — no html/head/body/article wrapper>",
  "category": "${keyword.category || 'general'}",
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}`;

    const raw = await callGroqWithRetry('openai/gpt-oss-120b', writingPrompt, 3, 6000);
    const post = parseJson(raw);

    if (!post.title || !post.content) throw new Error('Model returned incomplete post (missing title or content).');

    const newPost = {
        id: fileId,
        date: formattedDate,
        title: post.title,
        excerpt: post.excerpt || '',
        category: post.category || keyword.category || 'general',
        tags: Array.isArray(post.tags) ? post.tags : [],
        thumbnail: tmdbResult?.thumbnail || null,
        tmdb_ids: tmdbResult ? [tmdbResult.tmdbId] : [],
        readTimeMinutes: estimateReadTime(post.content),
        content: cleanHtml(post.content),
        link: `/blog.html?id=${fileId}`
    };

    fs.writeFileSync(path.join(DRAFTS_DIR, fileName), buildHtmlDraft(newPost));
    console.log(`\n✅ Draft saved: drafts/${fileName}`);
    console.log(`  → To publish: run "Publish Blog Draft" workflow with filename: ${fileName}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\nPickMyBinge Blog Pipeline v6');

    if (!GROQ_API_KEY) { console.error('Error: GROQ_API_KEY not set.'); process.exit(1); }

    const keyword = await researchKeyword();
    const tmdbResult = await fetchTmdbImages(keyword.franchise || keyword.keyword);
    await generateBlog(keyword, tmdbResult);
}

main().catch(e => { console.error('\n❌ Pipeline failed:', e.message); process.exit(1); });
