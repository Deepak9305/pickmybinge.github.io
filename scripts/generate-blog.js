import fs from 'fs';
import path from 'path';

/**
 * PickMyBinge Blog Generation Pipeline v4
 * - 30-niche catalogue targeting mid-high volume / low-competition keywords
 * - Auto-selects next unused niche (checks published + drafts)
 * - Persona-based drafting (THE BINGER / THE CRITIC / THE NOSTALGIA TRAP)
 * - Multi-stage audit: Fact-Check Sanitizer → Editorial Polish
 * - Robust JSON parser with character-level state machine
 * - Smart rate-limit-aware retry with Groq's advised wait time
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const DRAFTS_DIR = path.join(process.cwd(), 'drafts');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// ─── Niche Catalogue ──────────────────────────────────────────────────────────
// Each niche targets a mid-high search volume, low-competition keyword cluster.
// tmdbType: 'movie' | 'tv'
// tmdbParams: passed directly to TMDB discover endpoint
// yearOffset: 0 = current year, -1 = previous year (for TV with sparse current-year data)

const NICHES = [
    {
        id: 'psychological-thrillers',
        label: 'Psychological Thrillers',
        nicheLabel: 'Psychological Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '9648,53' },
        category: 'movies',
        tags: ['psychological', 'thriller', 'mystery', 'movies']
    },
    {
        id: 'heist-movies',
        label: 'Heist & Crime Capers',
        nicheLabel: 'Heist Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '80,28' },
        category: 'movies',
        tags: ['heist', 'crime', 'action', 'movies']
    },
    {
        id: 'time-travel-sci-fi',
        label: 'Time Travel Sci-Fi Movies',
        nicheLabel: 'Time Travel Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '878,12' },
        category: 'movies',
        tags: ['time-travel', 'sci-fi', 'adventure', 'movies']
    },
    {
        id: 'survival-thrillers',
        label: 'Survival Thriller Movies',
        nicheLabel: 'Survival Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '28,53,12' },
        category: 'movies',
        tags: ['survival', 'thriller', 'action', 'movies']
    },
    {
        id: 'sci-fi-thrillers',
        label: 'Sci-Fi Thrillers',
        nicheLabel: 'Sci-Fi Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '878,53' },
        category: 'movies',
        tags: ['sci-fi', 'thriller', 'action', 'movies']
    },
    {
        id: 'horror-movies',
        label: 'Horror Movies',
        nicheLabel: 'Horror Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '27' },
        category: 'movies',
        tags: ['horror', 'scary', 'thriller', 'movies']
    },
    {
        id: 'horror-comedy-movies',
        label: 'Horror Comedy Movies',
        nicheLabel: 'Horror Comedy',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '27,35' },
        category: 'movies',
        tags: ['horror', 'comedy', 'genre-mashup', 'movies']
    },
    {
        id: 'post-apocalyptic-movies',
        label: 'Post-Apocalyptic Movies',
        nicheLabel: 'Post-Apocalyptic Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '878,28' },
        category: 'movies',
        tags: ['post-apocalyptic', 'sci-fi', 'dystopia', 'movies']
    },
    {
        id: 'spy-thriller-movies',
        label: 'Spy & Espionage Thrillers',
        nicheLabel: 'Spy Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '53,28' },
        category: 'movies',
        tags: ['spy', 'espionage', 'thriller', 'action', 'movies']
    },
    {
        id: 'romantic-comedies',
        label: 'Romantic Comedies',
        nicheLabel: 'Rom-Com',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '10749,35' },
        category: 'movies',
        tags: ['romance', 'comedy', 'feel-good', 'movies']
    },
    {
        id: 'mystery-thriller-movies',
        label: 'Mystery Thriller Movies',
        nicheLabel: 'Mystery Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '9648,53', sort_by: 'vote_average.desc', 'vote_count.gte': 50 },
        category: 'movies',
        tags: ['mystery', 'thriller', 'detective', 'movies']
    },
    {
        id: 'action-comedy-movies',
        label: 'Action Comedy Movies',
        nicheLabel: 'Action Comedy',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '28,35' },
        category: 'movies',
        tags: ['action', 'comedy', 'fun', 'movies']
    },
    {
        id: 'biopics',
        label: 'Biopics & True Story Movies',
        nicheLabel: 'Biopic',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '18,36' },
        category: 'movies',
        tags: ['biopic', 'true-story', 'drama', 'movies']
    },
    {
        id: 'space-sci-fi-movies',
        label: 'Space Sci-Fi Movies',
        nicheLabel: 'Space Sci-Fi Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '878,12' },
        category: 'movies',
        tags: ['space', 'sci-fi', 'adventure', 'movies']
    },
    {
        id: 'family-adventure-movies',
        label: 'Family Adventure Movies',
        nicheLabel: 'Family Adventure Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '10751,12' },
        category: 'movies',
        tags: ['family', 'adventure', 'feel-good', 'movies']
    },
    {
        id: 'spanish-language-thrillers',
        label: 'Spanish Language Thrillers',
        nicheLabel: 'Spanish Thriller',
        tmdbType: 'movie',
        tmdbParams: { with_original_language: 'es', with_genres: '53,27' },
        category: 'movies',
        tags: ['spanish', 'thriller', 'international', 'movies']
    },
    {
        id: 'french-language-cinema',
        label: 'French Language Cinema',
        nicheLabel: 'French Film',
        tmdbType: 'movie',
        tmdbParams: { with_original_language: 'fr' },
        category: 'movies',
        tags: ['french', 'international', 'cinema', 'movies']
    },
    {
        id: 'martial-arts-action',
        label: 'Martial Arts Action Movies',
        nicheLabel: 'Martial Arts Film',
        tmdbType: 'movie',
        tmdbParams: { with_genres: '28,12', with_original_language: 'zh' },
        category: 'movies',
        tags: ['martial-arts', 'action', 'asian-cinema', 'movies']
    },
    {
        id: 'k-dramas',
        label: 'K-Dramas',
        nicheLabel: 'K-Drama',
        tmdbType: 'tv',
        tmdbParams: { with_original_language: 'ko' },
        category: 'korean',
        tags: ['k-drama', 'korean', 'tv-shows', 'streaming'],
        yearOffset: -1
    },
    {
        id: 'crime-drama-series',
        label: 'Crime Drama Series',
        nicheLabel: 'Crime Drama',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '80,18' },
        category: 'tv',
        tags: ['crime', 'drama', 'thriller', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'dark-fantasy-series',
        label: 'Dark Fantasy Series',
        nicheLabel: 'Dark Fantasy Show',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '10765,18' },
        category: 'tv',
        tags: ['fantasy', 'dark', 'drama', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'supernatural-horror-series',
        label: 'Supernatural Horror Series',
        nicheLabel: 'Supernatural Horror Show',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '27,9648' },
        category: 'tv',
        tags: ['supernatural', 'horror', 'mystery', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'anime-series',
        label: 'Anime Series',
        nicheLabel: 'Anime',
        tmdbType: 'tv',
        tmdbParams: { with_original_language: 'ja', with_genres: '16' },
        category: 'tv',
        tags: ['anime', 'animation', 'japanese', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'period-drama-series',
        label: 'Period Drama Series',
        nicheLabel: 'Period Drama',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '36,18' },
        category: 'tv',
        tags: ['period-drama', 'historical', 'drama', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'political-thriller-series',
        label: 'Political Thriller Series',
        nicheLabel: 'Political Thriller',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '10768,18' },
        category: 'tv',
        tags: ['political', 'thriller', 'drama', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'dystopian-sci-fi-series',
        label: 'Dystopian Sci-Fi Series',
        nicheLabel: 'Dystopian Sci-Fi Show',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '10765' },
        category: 'tv',
        tags: ['dystopia', 'sci-fi', 'futuristic', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'nordic-noir',
        label: 'Nordic Noir & Scandinavian Crime',
        nicheLabel: 'Nordic Noir',
        tmdbType: 'tv',
        tmdbParams: { with_original_language: 'sv', with_genres: '80,18' },
        category: 'tv',
        tags: ['nordic-noir', 'scandinavian', 'crime', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'cozy-mystery-series',
        label: 'Cozy Mystery Series',
        nicheLabel: 'Cozy Mystery',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '9648,35' },
        category: 'tv',
        tags: ['cozy-mystery', 'mystery', 'comedy', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'true-crime-series',
        label: 'True Crime Drama Series',
        nicheLabel: 'True Crime Drama',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '80,99' },
        category: 'tv',
        tags: ['true-crime', 'crime', 'documentary', 'tv-shows'],
        yearOffset: -1
    },
    {
        id: 'superhero-series',
        label: 'Superhero Series',
        nicheLabel: 'Superhero Show',
        tmdbType: 'tv',
        tmdbParams: { with_genres: '10759,10765' },
        category: 'tv',
        tags: ['superhero', 'action', 'fantasy', 'tv-shows'],
        yearOffset: -1
    }
];

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

// ─── Niche Selection ──────────────────────────────────────────────────────────

function getUsedNicheIds() {
    const used = new Set();

    // Check published manifest
    if (fs.existsSync(MANIFEST_PATH)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
            for (const fileName of manifest) {
                const nicheSlug = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.json', '');
                used.add(nicheSlug);
            }
        } catch { }
    }

    // Check drafts folder
    if (fs.existsSync(DRAFTS_DIR)) {
        for (const file of fs.readdirSync(DRAFTS_DIR)) {
            if (file.endsWith('.json')) {
                const nicheSlug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.json', '');
                used.add(nicheSlug);
            }
        }
    }

    return used;
}

function selectNiche(overrideId) {
    if (overrideId) {
        const found = NICHES.find(n => n.id === overrideId || n.label.toLowerCase() === overrideId.toLowerCase());
        if (!found) throw new Error(`Unknown niche override: "${overrideId}". Valid IDs: ${NICHES.map(n => n.id).join(', ')}`);
        return found;
    }

    const usedIds = getUsedNicheIds();
    console.log(`  → Used niche IDs so far: ${[...usedIds].join(', ') || 'none'}`);

    let candidates = NICHES.filter(n => !usedIds.has(n.id));
    if (candidates.length === 0) {
        console.log('  → All niches covered — cycling from the beginning.');
        candidates = NICHES;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
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

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline(niche) {
    const MODEL = 'llama-3.3-70b-versatile';

    try {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  Niche: ${niche.label} (${niche.id})`);
        console.log(`${'─'.repeat(60)}`);

        [BLOG_DIR, DRAFTS_DIR].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });

        // ── Same-day guard ────────────────────────────────────────────────────
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `${formattedDate}-${niche.id}.json`;
        const fileId = `${formattedDate}-${niche.id}`;

        if (fs.existsSync(path.join(DRAFTS_DIR, fileName))) {
            console.log(`  ℹ️  Draft for ${fileId} already exists — skipping.`);
            return true;
        }

        // ── STEP 1: Discover titles from TMDB ────────────────────────────────
        console.log('\n[STEP 1] Discovering fresh titles from TMDB...');
        const usedTmdbIds = getUsedTmdbIds();
        console.log(`  → ${usedTmdbIds.size} previously used TMDB IDs loaded.`);

        const currentYear = now.getFullYear();
        const targetYear = currentYear + (niche.yearOffset || 0);
        const yearKey = niche.tmdbType === 'tv' ? 'first_air_date_year' : 'primary_release_year';

        const freshResults = [];
        let page = 1;

        while (freshResults.length < 5 && page <= 10) {
            const pageData = await fetchFromTMDB(`discover/${niche.tmdbType}`, {
                [yearKey]: targetYear,
                sort_by: 'popularity.desc',
                ...niche.tmdbParams,
                page
            });

            const fresh = (pageData.results || []).filter(item => !usedTmdbIds.has(item.id));
            freshResults.push(...fresh);
            if (!pageData.results || pageData.results.length === 0) break;
            page++;
        }

        // Fallback: try one extra year back if we got too few results
        if (freshResults.length < 5) {
            console.log(`  → Only ${freshResults.length} results — trying ${targetYear - 1} as fallback...`);
            page = 1;
            while (freshResults.length < 5 && page <= 5) {
                const pageData = await fetchFromTMDB(`discover/${niche.tmdbType}`, {
                    [yearKey]: targetYear - 1,
                    sort_by: 'popularity.desc',
                    ...niche.tmdbParams,
                    page
                });
                const fresh = (pageData.results || []).filter(item => !usedTmdbIds.has(item.id));
                freshResults.push(...fresh);
                if (!pageData.results || pageData.results.length === 0) break;
                page++;
            }
        }

        const topResults = freshResults.slice(0, 5);
        if (topResults.length === 0) throw new Error('No fresh content found on TMDB — all top titles already covered.');

        // ── STEP 2: Enrich each title with full details ───────────────────────
        console.log('\n[STEP 2] Fetching enriched details...');
        const enrichedContent = await Promise.all(
            topResults.map(item => fetchEnrichedItem(item.id, niche.tmdbType))
        );
        console.log(`  → Enriched ${enrichedContent.length} titles.`);

        // ── STEP 3: Persona-based AI writing pass ─────────────────────────────
        const persona = pickPersona();
        console.log(`\n[STEP 3] Generating article (persona: ${persona.name})...`);

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

You are writing a feature article for PickMyBinge, a premium entertainment blog targeting the keyword: "${niche.label}".
Write in YOUR DISTINCTIVE VOICE: ${persona.style}.

SOURCE DATA — you MUST cover all 5 titles below. Do NOT invent any titles, cast names, or facts not listed here:

${sourceSummary}

ARTICLE STRUCTURE (follow exactly):
1. HOOK — 2 punchy paragraphs that open with a specific, bold observation about ${niche.nicheLabel}s right now. NO "In the world of...", "Buckle up", or "As we step into..." openers. Start with something unexpected.
2. For EACH of the 5 titles write a section with:
   - <h2><a href="[tmdb_link]">[Title] ([Year])</a></h2>
   - <img loading="lazy" src="[exact poster URL]" alt="[Title] poster" class="blog-image">
   - <p><strong>Starring:</strong> [cast names]</p>
   - <blockquote>[tagline — if none, write a one-line characterisation of the film's feel]</blockquote>
   - 3 paragraphs: (a) what it is actually about and what's surprising, (b) what makes it technically or narratively distinctive — be SPECIFIC to THIS title, (c) who will love it and one honest flaw
   - <p><span class="verdict-badge">PickMyBinge Verdict: [X]/10</span></p>
3. <h2>PickMyBinge Quick Picks</h2> — an HTML <table> with columns: Title | Genre | Rating | Must-Watch Factor
4. <h2>Watch If You Liked…</h2> — 2 specific recommendations (can be titles not in the source list)
5. <p>Ready to find your next binge? <a href="https://www.pickmybinge.com">PickMyBinge</a> has you covered.</p>

STRICT RULES:
- Output ONLY a valid JSON object: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }
- "title": specific, punchy SEO headline under 70 chars targeting "${niche.label}" — NOT generic
- "excerpt": vivid 1-sentence hook under 160 chars that makes someone want to read
- "content": full article as a single HTML string — no <html>/<body>/<style> tags, no inline style attributes
- "persona": the persona id ("BINGER", "CRITIC", or "NOSTALGIA")
- Minimum 1500 words in the content
- Every section covering a title MUST use DIFFERENT sentence openers and DIFFERENT observations
- BANNED PHRASES: "will keep you on the edge of your seat", "in the world of", "buckle up", "it's worth noting", "delve into", "dive into", "needless to say", "in conclusion", "at the end of the day"
- Use the EXACT poster URLs and TMDB links from the source data — never substitute or omit`;

        const draftRaw = await callGroqWithRetry(MODEL, writingPrompt, 3, 8000);
        const draft = parseJson(draftRaw);
        console.log(`  → Draft written by persona: ${draft.persona || persona.id}`);

        // ── STEP 4: Fact-Check + Editorial Polish ─────────────────────────────
        console.log('\n[STEP 4] Fact-check & editorial polish...');

        const reviewPrompt = `You are a Senior Editor at PickMyBinge. Fix factual errors and raise quality.

DRAFT:
${JSON.stringify(draft)}

AUTHORITATIVE SOURCE DATA (ground truth — fix any mismatches):
${sourceSummary}

FACT-CHECK (fix silently):
1. Title names, release years, cast names, ratings — must match source data exactly
2. Every <img src> must use the exact poster URL from source data
3. Every TMDB link must use the exact tmdb_link from source data
4. Remove any facts, titles, or claims NOT in the source data

QUALITY AUDIT (fix silently):
5. Title — is it specific and punchy for the keyword "${niche.label}"? Rewrite if generic
6. Excerpt — is it a vivid hook under 160 chars? Rewrite if bland
7. Hook paragraphs — bold and specific? Rewrite if generic
8. Repetition — different phrases in each title section? Rewrite any that re-use the same structure
9. Banned phrases to remove: "will keep you on the edge of your seat", "in the world of", "it's worth noting", "delve into", "needless to say"
10. Verify every title section has: <h2>, <img>, <blockquote>, 3 paragraphs, verdict-badge
11. Verify Quick Picks <table> and Watch If You Liked section exist

Return ONLY the corrected JSON: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }`;

        const polishedRaw = await callGroqWithRetry(MODEL, reviewPrompt, 3, 8000);
        const polished = parseJson(polishedRaw);
        console.log('  → Polish complete.');

        const missing = ['title', 'excerpt', 'content'].filter(k => !polished[k]);
        if (missing.length > 0) throw new Error(`Polished post missing fields: ${missing.join(', ')}`);

        // ── STEP 5: Clean HTML ────────────────────────────────────────────────
        console.log('\n[STEP 5] Cleaning HTML artifacts...');
        polished.content = cleanHtml(polished.content);

        // ── STEP 6: Save draft ────────────────────────────────────────────────
        console.log('\n[STEP 6] Saving draft...');
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        const newPost = {
            id: fileId,
            date: `${year}-${month}-${day}`,
            title: polished.title,
            excerpt: polished.excerpt,
            persona: polished.persona || persona.id,
            category: niche.category,
            tags: niche.tags,
            tmdb_ids: enrichedContent.map(item => item.id),
            readTimeMinutes: estimateReadTime(polished.content),
            content: polished.content,
            link: `/blog.html?id=${fileId}`
        };

        fs.writeFileSync(path.join(DRAFTS_DIR, fileName), JSON.stringify(newPost, null, 4));
        console.log(`  → Draft saved: drafts/${fileName}`);
        console.log(`  → To publish: run "Publish Blog Draft" action with filename: ${fileName}`);

        console.log(`\n✅ Pipeline complete: ${fileId} [persona: ${newPost.persona}]`);
        return true;

    } catch (error) {
        console.error(`\n❌ Pipeline failed for "${niche.label}":`, error.message);
        if (error.cause) console.error('   Cause:', error.cause);
        return false;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\nPickMyBinge Blog Pipeline v4');

    const niche = selectNiche(process.env.BLOG_NICHE || '');
    console.log(`Generating 1 post for: ${niche.label} (${niche.id})\n`);

    const ok = await runPipeline(niche);

    console.log('\n─── Final Result ───');
    console.log(`  ${ok ? '✅' : '❌'} ${niche.label}`);
    console.log('────────────────────\n');

    process.exit(ok ? 0 : 1);
}

main();
