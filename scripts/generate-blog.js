import fs from 'fs';
import path from 'path';

/**
 * PickMyBinge Blog Generation Pipeline v3
 * - Persona-based drafting (THE BINGER / THE CRITIC / THE NOSTALGIA TRAP)
 * - Multi-stage audit: Fact-Check Sanitizer → Editorial Polish
 * - Regex post-processing to remove AI artifacts
 * - Robust JSON parser with character-level state machine
 * - Smart rate-limit-aware retry with Groq's advised wait time
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const DRAFTS_DIR = path.join(process.cwd(), 'drafts');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// ─── Persona Definitions ───────────────────────────────────────────────────────

const PERSONAS = [
    {
        id: 'BINGER',
        name: 'THE BINGER',
        voice: `You write like a passionate friend texting their group chat at midnight about a show they can't stop watching. 
Your tone is warm, excited, and deeply relatable. You use phrases like "if this doesn't hook you in episode 1, I'll eat my remote", 
"absolute comfort watch", "the cast chemistry is INSANE". You speak directly to the reader as "you". 
You focus on: binge-worthiness, emotional payoff, pacing, and rewatchability. Avoid academic language.`,
        style: 'conversational, enthusiastic, relatable'
    },
    {
        id: 'CRITIC',
        name: 'THE CRITIC',
        voice: `You write like a seasoned entertainment journalist with a Letterboxd account and strong opinions. 
Your tone is sharp, analytical, and authoritative. You dissect cinematography, narrative structure, thematic subtext, 
and directorial choices. Use precise film vocabulary: mise-en-scène, diegetic sound, narrative economy, character foil. 
You are not afraid to call out weaknesses. You back every claim with specific scene references.`,
        style: 'analytical, authoritative, precise'
    },
    {
        id: 'NOSTALGIA',
        name: 'THE NOSTALGIA TRAP',
        voice: `You write through the lens of pop-culture history. Everything new reminds you of something classic from the golden age.
Your tone is nostalgic, wry, and deeply comparative. You say things like "This gives us the same unhinged energy that [classic] had in [year]" 
or "If [old show] and [other show] had a baby watching Netflix at 2am, this would be it". 
You connect new titles to beloved classics and explain what old fans of those shows will love about these new ones.`,
        style: 'nostalgic, comparative, warm'
    }
];

function pickPersona() {
    return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}

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
            // Parse Groq's suggested wait time, e.g. "Please try again in 36.43s."
            const match = e.message.match(/try again in ([\d.]+)s/i);
            const waitMs = match
                ? Math.ceil(parseFloat(match[1]) * 1000) + 2000
                : 60000;
            console.log(`  ⏳ Rate limit hit — waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
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

/**
 * Robustly parses a JSON object that may contain literal (unescaped) newlines,
 * carriage returns, or tabs inside string values — a common LLM output artifact.
 */
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

/**
 * Cleans up common LLM HTML artifacts from the content field.
 */
function cleanHtml(html) {
    let out = html;

    // Remove generic opener paragraphs
    out = out.replace(
        /<p[^>]*>\s*(In the world of|As we step into|Welcome to the world of|In today's|It's no secret that)[^<]*<\/p>/gi,
        ''
    );

    // Remove filler phrases inline
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

    // Ensure all <img> tags have loading="lazy"
    out = out.replace(/<img\b(?![^>]*loading=)/gi, '<img loading="lazy"');

    // Remove empty paragraphs
    out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');

    // Remove inline style attributes (LLM sometimes sneaks them in)
    out = out.replace(/\s*style="[^"]*"/gi, '');

    return out.trim();
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

// ─── Index Helpers ────────────────────────────────────────────────────────────

function updateBlogsIndex(newEntry) {
    let index = [];
    if (fs.existsSync(BLOGS_INDEX)) {
        try { index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')); } catch { }
    }
    index = index.filter(p => p.id !== newEntry.id);
    index.unshift(newEntry);
    fs.writeFileSync(BLOGS_INDEX, JSON.stringify(index, null, 4));
    console.log(`  → blogs-index.json updated (${index.length} entries).`);
}

function updateManifest(fileName) {
    let manifest = [];
    if (fs.existsSync(MANIFEST_PATH)) {
        try {
            manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
            if (!Array.isArray(manifest)) throw new Error('manifest.json is not an array');
        } catch (err) {
            // Bail out so we don't overwrite a corrupted manifest and nuke history
            console.error(`  ✗ manifest.json unreadable — aborting manifest update: ${err.message}`);
            return;
        }
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

        // ── Same-day guard ────────────────────────────────────────────────────
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const slug = nicheHint.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileId = `${formattedDate}-${slug}`;
        const fileName = `${fileId}.json`;

        if (fs.existsSync(path.join(DRAFTS_DIR, fileName))) {
            console.log(`  ℹ️  Draft for ${fileId} already exists — skipping.`);
            return true;
        }

        // ── STEP 1: Discover titles from TMDB (skip already-covered IDs) ─────
        console.log('\n[STEP 1] Discovering fresh titles from TMDB...');
        const usedIds = getUsedTmdbIds();
        console.log(`  → ${usedIds.size} previously used TMDB IDs loaded.`);

        const currentYear = now.getFullYear();
        const itemType = nicheHint === 'K-Dramas' ? 'tv' : 'movie';
        const freshResults = [];
        let page = 1;

        while (freshResults.length < 5 && page <= 10) {
            let pageData;
            if (nicheHint === 'K-Dramas') {
                pageData = await fetchFromTMDB('discover/tv', {
                    first_air_date_year: currentYear - 1,
                    with_original_language: 'ko',
                    sort_by: 'popularity.desc',
                    page
                });
            } else {
                pageData = await fetchFromTMDB('discover/movie', {
                    primary_release_year: currentYear,
                    with_genres: '878,53',
                    sort_by: 'popularity.desc',
                    page
                });
            }

            const fresh = (pageData.results || []).filter(item => !usedIds.has(item.id));
            freshResults.push(...fresh);
            if (!pageData.results || pageData.results.length === 0) break;
            page++;
        }

        const topResults = freshResults.slice(0, 5);
        if (topResults.length === 0) throw new Error('No fresh content found on TMDB — all top titles already covered.');

        // ── STEP 2: Enrich each title with full details ───────────────────────
        console.log('\n[STEP 2] Fetching enriched details for each title...');
        const enrichedContent = await Promise.all(
            topResults.map(item => fetchEnrichedItem(item.id, itemType))
        );
        console.log(`  → Enriched ${enrichedContent.length} titles.`);

        const category = nicheHint === 'K-Dramas' ? 'korean' : 'movies';
        const nicheLabel = nicheHint === 'K-Dramas' ? 'K-Drama' : 'Sci-Fi Thriller';

        // ── STEP 3: Persona-based AI writing pass ─────────────────────────────
        const persona = pickPersona();
        console.log(`\n[STEP 3] Generating article (persona: ${persona.name})...`);

        // Slim source data — send only what's needed for writing, not raw TMDB blobs
        const sourceSummary = enrichedContent.map((t, i) => `
TITLE ${i + 1}: ${t.title} (${(t.release_date || '').substring(0, 4)})
- Genres: ${t.genres.join(', ')}
- Cast: ${t.cast.join(', ')}
- Rating: ${t.rating}/10
- Runtime: ${t.runtime}
- Tagline: "${t.tagline || 'N/A'}"
- Overview: ${t.overview}
- Poster URL: ${t.poster}
- TMDB Link: ${t.tmdb_link}
`.trim()).join('\n\n');

        const writingPrompt = `${persona.voice}

You are writing a feature article for PickMyBinge, a premium entertainment blog. Write in YOUR DISTINCTIVE VOICE: ${persona.style}.

SOURCE DATA — you MUST cover all 5 titles below. Do NOT invent any titles, cast names, or facts not listed here:

${sourceSummary}

ARTICLE STRUCTURE (follow exactly):
1. HOOK — 2 punchy paragraphs that open with a specific, bold observation about this genre right now. NO "In the world of...", "Buckle up", or "As we step into..." openers. Start with something unexpected.
2. For EACH of the 5 titles write a section with:
   - <h2><a href="[tmdb_link]">[Title] ([Year])</a></h2>
   - <img loading="lazy" src="[exact poster URL]" alt="[Title] poster" class="blog-image">
   - <p><strong>Starring:</strong> [cast names]</p>
   - <blockquote>[tagline — if none, write a one-line characterisation of the film's feel]</blockquote>
   - 3 paragraphs: (a) what the film is actually about and what's surprising about it, (b) what makes it technically or narratively distinctive — be SPECIFIC to THIS film, (c) who will love it and one flaw to be honest about
   - <p><span class="verdict-badge">PickMyBinge Verdict: [X]/10</span></p>
3. <h2>PickMyBinge Quick Picks</h2> — an HTML <table> with columns: Title | Genre | Rating | Must-Watch Factor
4. <h2>Watch If You Liked…</h2> — 2 specific recommendations (can be films not in the source list)
5. <p>Ready to find your next binge? <a href="https://www.pickmybinge.com">PickMyBinge</a> has you covered.</p>

STRICT RULES:
- Output ONLY a valid JSON object: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }
- "title": specific, punchy SEO headline under 70 chars — NOT generic (e.g. "5 Sci-Fi Thrillers That Actually Deliver" not "Sci-Fi Thrill Ride")
- "excerpt": vivid 1-sentence hook under 160 chars that makes someone want to read
- "content": full article as a single HTML string — no <html>/<body>/<style> tags, no inline style attributes
- "persona": the persona id ("BINGER", "CRITIC", or "NOSTALGIA")
- Minimum 1500 words in the content
- Every section covering a title MUST use DIFFERENT sentence openers and DIFFERENT observations — never repeat the same structure or phrase across sections
- BANNED PHRASES: "will keep you on the edge of your seat", "in the world of", "buckle up", "it's worth noting", "delve into", "dive into", "needless to say", "in conclusion", "at the end of the day"
- Use the EXACT poster URLs and TMDB links from the source data — never substitute or omit`;

        const draftRaw = await callGroqWithRetry(MODEL, writingPrompt, 3, 8000);
        const draft = parseJson(draftRaw);
        console.log(`  → Draft written by persona: ${draft.persona || persona.id}`);

        // ── STEP 4: Fact-Check + Editorial Polish (single combined pass) ───────
        console.log('\n[STEP 4] Fact-check & editorial polish...');

        const reviewPrompt = `You are a Senior Editor at PickMyBinge. You have two jobs: fix factual errors and raise quality.

DRAFT:
${JSON.stringify(draft)}

AUTHORITATIVE SOURCE DATA (ground truth — fix any mismatches):
${sourceSummary}

FACT-CHECK (fix silently, no commentary):
1. Title names, release years, cast names, ratings — must match source data exactly
2. Every <img src> must use the exact poster URL from source data
3. Every TMDB link must use the exact tmdb_link from source data
4. Remove any facts, titles, or claims NOT in the source data

QUALITY AUDIT (fix silently):
5. Title — is it specific and punchy? Rewrite if it's generic (e.g. "Sci-Fi Thrill Ride" is too generic)
6. Excerpt — is it a vivid hook under 160 chars? Rewrite if bland
7. Hook paragraphs — does the article open with something bold and specific? Rewrite if generic
8. Repetition — are different phrases used in each film section? Rewrite any section that re-uses the same sentence structure or ending as another
9. Banned phrases to remove: "will keep you on the edge of your seat", "in the world of", "it's worth noting", "delve into", "needless to say"
10. Verify every film section has: <h2>, <img>, <blockquote>, 3 paragraphs, verdict-badge
11. Verify Quick Picks <table> and Watch If You Liked section exist

Return ONLY the corrected JSON: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }`;

        const polishedRaw = await callGroqWithRetry(MODEL, reviewPrompt, 3, 8000);
        const polished = parseJson(polishedRaw);
        console.log('  → Fact-check & polish complete.');

        // Validation
        const missing = ['title', 'excerpt', 'content'].filter(k => !polished[k]);
        if (missing.length > 0) throw new Error(`Polished post missing fields: ${missing.join(', ')}`);

        // ── STEP 6: Local post-processing ─────────────────────────────────────
        console.log('\n[STEP 6] Cleaning HTML artifacts...');
        polished.content = cleanHtml(polished.content);
        console.log('  → HTML cleaned.');

        // ── STEP 7: Build and save ────────────────────────────────────────────
        console.log('\n[STEP 7] Saving files...');
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        const tags = nicheHint === 'K-Dramas'
            ? ['k-drama', 'korean', 'tv-shows', 'streaming']
            : ['sci-fi', 'thriller', 'movies', 'action'];

        const newPost = {
            id: fileId,
            date: `${year}-${month}-${day}`,
            title: polished.title,
            excerpt: polished.excerpt,
            persona: polished.persona || persona.id,
            category,
            tags,
            tmdb_ids: enrichedContent.map(item => item.id),
            readTimeMinutes: estimateReadTime(polished.content),
            content: polished.content,
            link: `/blog.html?id=${fileId}`
        };

        const draftPath = path.join(DRAFTS_DIR, fileName);
        fs.writeFileSync(draftPath, JSON.stringify(newPost, null, 4));
        console.log(`  → Draft saved: public/content/1st draft/${fileName}`);
        console.log(`  → To publish, run the "Publish Blog Draft" action with filename: ${fileName}`);

        console.log(`\n✅ Pipeline complete: ${fileId} [persona: ${newPost.persona}]`);
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
    const niche = process.env.BLOG_NICHE || niches[Math.floor(Math.random() * niches.length)];

    console.log(`\nPickMyBinge Blog Pipeline v3`);
    console.log(`Generating 1 post for: ${niche}\n`);

    const ok = await runPipeline(niche);

    console.log('\n─── Final Result ───');
    console.log(`  ${ok ? '✅' : '❌'} ${niche}`);
    console.log('────────────────────\n');

    process.exit(ok ? 0 : 1);
}

main();
