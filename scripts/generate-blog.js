import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Autonomous Blog Generation Pipeline
 * 5-stage: LLM vertical selection → TMDB fetch → persona-voiced draft →
 *          hostile fact-check → lead editor polish → post-process → auto-deploy
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');

// ---------------------------------------------------------------------------
// Content verticals — each maps to a TMDB endpoint + query params
// ---------------------------------------------------------------------------
const VERTICALS = {
    'Sci-Fi Thrillers': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2025, with_genres: '878,53', sort_by: 'popularity.desc' }
    },
    'K-Dramas': {
        endpoint: 'discover/tv',
        params: { first_air_date_year: 2024, with_original_language: 'ko', sort_by: 'popularity.desc' }
    },
    'Superhero & Comic Book': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2025, with_keywords: '9715|180547', sort_by: 'popularity.desc' }
    },
    'Horror & Psychological Thriller': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2025, with_genres: '27,9648', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    },
    'Anime Series': {
        endpoint: 'discover/tv',
        params: { with_genres: '16', with_keywords: '210024', sort_by: 'popularity.desc', first_air_date_year: 2025 }
    },
    'Hidden Gem Movies': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2024, sort_by: 'vote_average.desc', 'vote_count.gte': 100, 'vote_count.lte': 1000, 'vote_average.gte': 7.0 }
    },
    'Prestige TV Dramas': {
        endpoint: 'discover/tv',
        params: { first_air_date_year: 2025, with_genres: '18', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    },
    'Action & Adventure Blockbusters': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2025, with_genres: '28,12', sort_by: 'popularity.desc' }
    },
    'True Crime & Docuseries': {
        endpoint: 'discover/tv',
        params: { first_air_date_year: 2025, with_genres: '99', with_keywords: '11108|173432', sort_by: 'popularity.desc' }
    },
    'Romantic Dramas & Rom-Coms': {
        endpoint: 'discover/movie',
        params: { primary_release_year: 2025, with_genres: '10749,35', sort_by: 'popularity.desc' }
    },
};

// ---------------------------------------------------------------------------
// Audience personas — injected as the opening system instruction for Stage 2
// ---------------------------------------------------------------------------
const PERSONAS = {
    CASUAL: `You are a casual, enthusiastic binge-watcher writing for PickMyBinge.
Your energy is "what should I watch tonight?" — friendly, zero pretension, relatable.
Write like you're texting your best friend about something they absolutely have to watch.
Use conversational language, short punchy sentences, and light humour.
Avoid film-school jargon. Say "the way it looks is insane" instead of "cinematography".
Goal: make the reader hit play immediately.`,

    CINEPHILE: `You are a seasoned film critic and cultural analyst writing for PickMyBinge.
Your voice is authoritative, precise, and intellectually stimulating — but never snobbish.
Analyse directorial choices, cinematographic language, thematic subtext, and cultural significance.
Reference relevant genre history or comparable auteurs where appropriate.
Use technical vocabulary correctly and explain it in context so general readers follow along.
Goal: give the reader a deeper appreciation of what they're watching, not just whether to watch it.`,

    DISCOVERER: `You are a hidden-gem hunter and niche recommendation specialist writing for PickMyBinge.
You live for titles that got overlooked, slept on, or buried under algorithmic noise.
Your voice is conspiratorial and enthusiastic — like you're letting the reader in on a secret.
Lead with why a title was underrated, what the mainstream missed, and who will love it.
Use phrases like "slept on", "criminally underrated", "if you haven't seen this yet".
Goal: make the reader feel like they discovered something the algorithm doesn't want them to find.`,
};

// ---------------------------------------------------------------------------
// Utility functions (unchanged from previous version)
// ---------------------------------------------------------------------------
async function callGroq(model, prompt) {
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing from environment.");
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(`Groq API Error: ${data.error.message}`);
    return data.choices[0].message.content;
}

async function callGroqWithRetry(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await callGroq(model, prompt);
        } catch (e) {
            console.error(`Attempt ${i + 1} failed for model ${model}:`, e.message);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function fetchFromTMDB(endpoint, params = {}) {
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is missing from environment.");
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url.toString());
    return await response.json();
}

function parseJson(str) {
    try {
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("No JSON object found");
        let clean = str.substring(start, end + 1);
        clean = clean.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        return JSON.parse(clean);
    } catch (e) {
        console.error("Failed to parse JSON. Raw snippet:", str.substring(0, 500));
        throw new Error(`JSON Parse Error: ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// pickVertical — uses today's TMDB trending + llama-4-scout to choose niche
// ---------------------------------------------------------------------------
async function pickVertical() {
    // Allow manual override for testing / CI
    if (process.env.BLOG_NICHE && VERTICALS[process.env.BLOG_NICHE]) {
        console.log(`Using forced vertical from env: ${process.env.BLOG_NICHE}`);
        return process.env.BLOG_NICHE;
    }

    console.log('Selecting vertical via LLM analysis of today\'s TMDB trending...');
    const trending = await fetchFromTMDB('trending/all/day', {});
    const trendingSample = trending.results.slice(0, 10).map(item => ({
        title: item.title || item.name,
        media_type: item.media_type,
        genre_ids: item.genre_ids,
        overview: item.overview?.substring(0, 120)
    }));

    const verticalNames = Object.keys(VERTICALS);
    const selectionPrompt = `You are a content strategist for PickMyBinge, an entertainment recommendation site.
Today's TMDB trending titles are: ${JSON.stringify(trendingSample)}

Available content verticals: ${JSON.stringify(verticalNames)}

Based on what is trending today, pick the ONE vertical that would produce the most engaging and timely blog post.
Consider: which vertical has the most trending momentum right now?

Respond with ONLY a JSON object: {"vertical": "<vertical name>", "reason": "<one sentence>"}
The vertical name must exactly match one of the options provided.`;

    try {
        const raw = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', selectionPrompt);
        const parsed = parseJson(raw);
        if (VERTICALS[parsed.vertical]) {
            console.log(`LLM chose vertical: "${parsed.vertical}" — ${parsed.reason}`);
            return parsed.vertical;
        }
        throw new Error(`LLM returned unknown vertical: ${parsed.vertical}`);
    } catch (e) {
        const fallback = verticalNames[Math.floor(Math.random() * verticalNames.length)];
        console.warn(`Vertical selection failed (${e.message}), falling back to random: "${fallback}"`);
        return fallback;
    }
}

// ---------------------------------------------------------------------------
// postProcess — strips common LLM artifacts from the final HTML content
// ---------------------------------------------------------------------------
function postProcess(content) {
    if (!content || typeof content !== 'string') return content;
    let c = content;

    // 1. Remove "In conclusion" paragraph openers
    c = c.replace(/<p>\s*In conclusion[,:]?\s*/gi, '<p>');
    c = c.replace(/\bIn conclusion[,:]?\s+/gi, '');

    // 2. Remove "As an AI" self-referential phrases
    c = c.replace(/As an AI(?: language model)?[,]?\s*/gi, '');
    c = c.replace(/I(?:'m| am) an AI[^.]*\.\s*/gi, '');

    // 3. Deduplicate H2 tags (keeps first occurrence of each)
    const seenH2 = new Set();
    c = c.replace(/<h2[^>]*>.*?<\/h2>/gi, (match) => {
        const key = match.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seenH2.has(key)) return '';
        seenH2.add(key);
        return match;
    });

    // 4. Remove consecutive duplicate sentences
    c = c.replace(/(\b[A-Z][^.!?]*[.!?])\s+\1/g, '$1');

    // 5. Strip generic sign-off paragraphs
    c = c.replace(/<p>[^<]*(?:hope you enjoyed|let me know what you think|feel free to)[^<]*<\/p>/gi, '');

    // 6. Collapse multiple consecutive empty <p> tags
    c = c.replace(/(<p>\s*<\/p>\s*){2,}/gi, '');

    return c.trim();
}

// ---------------------------------------------------------------------------
// autoDeploy — regenerates sitemap, commits, and pushes to GitHub
// ---------------------------------------------------------------------------
async function autoDeploy(date) {
    console.log('\n--- Starting Auto-Deploy ---');
    try {
        console.log('Regenerating sitemap...');
        execSync('node scripts/generate-sitemap.js', { stdio: 'inherit', cwd: process.cwd() });

        execSync('git add public/content/blogs/ public/blogs-index.json public/sitemap.xml sitemap.xml', {
            stdio: 'inherit', cwd: process.cwd()
        });

        execSync(`git commit -m "Autonomous Blog Update: ${date}"`, {
            stdio: 'inherit', cwd: process.cwd()
        });

        execSync('git push', { stdio: 'inherit', cwd: process.cwd() });

        console.log('Auto-deploy complete. Blog is live.');
    } catch (e) {
        console.error('Auto-deploy failed (blog JSON saved locally):', e.message);
        console.error('Run manually: git add public/content/blogs/ public/blogs-index.json && git commit -m "Manual blog deploy" && git push');
    }
}

// ---------------------------------------------------------------------------
// runPipeline — 5-stage orchestrator
// ---------------------------------------------------------------------------
async function runPipeline() {
    try {
        // PRE-STAGE: Vertical + Persona Selection
        const vertical = await pickVertical();
        const personaKeys = Object.keys(PERSONAS);
        const personaIndex = Math.floor(Math.random() * personaKeys.length);
        const personaName = personaKeys[personaIndex];
        const persona = PERSONAS[personaName];

        console.log(`\n--- Pipeline: ${vertical} | Persona: ${personaName} ---`);
        if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

        // STAGE 1: Fetch real titles from TMDB
        const { endpoint, params } = VERTICALS[vertical];
        const tmdbData = await fetchFromTMDB(endpoint, params);

        const realContent = tmdbData.results.slice(0, 5).map(item => ({
            title: item.title || item.name,
            id: item.id,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            tmdb_link: `https://www.themoviedb.org/${item.title ? 'movie' : 'tv'}/${item.id}`
        }));

        if (realContent.length === 0) throw new Error("No content found on TMDB.");
        console.log(`[Stage 1] Fetched ${realContent.length} titles for "${vertical}".`);

        // STAGE 2: Write article (persona-voiced, grounded in real TMDB titles)
        const writingPrompt = `${persona}

You are writing for PickMyBinge, a top entertainment recommendation site.
Write a VIRAL, high-retention feature article about these real titles: ${JSON.stringify(realContent)}.

Guidelines:
- Punchy structure (2-3 sentences max per paragraph)
- Include a "The PickMyBinge Verdict" section per title
- Include "Watch if you liked" recommendation per title
- Use blockquotes for memorable lines or insights
- Internal headers linked to TMDB URLs provided
- NO hallucinations — only reference the titles provided

Format in clean HTML (<p>, <h3>, <ul>, <li>, <blockquote>).
Output ONLY a JSON object with keys 'title', 'excerpt', and 'content'.`;

        const draftRaw = await callGroqWithRetry('openai/gpt-oss-120b', writingPrompt);
        const draft = parseJson(draftRaw);
        console.log(`[Stage 2] Draft written. Title: "${draft.title}"`);

        // STAGE 3: Hostile fact-check — strips hallucinations, tightens grounding
        const refinerPrompt = `You are a Hostile Lead Editor at PickMyBinge. Review this article for AI fluff, inaccuracies, and weak writing:
${JSON.stringify(draft)}

Ensure all title references exactly match these real titles: ${JSON.stringify(realContent.map(t => t.title))}.
Remove any hallucinated titles or facts not grounded in the source data.
Fix generic intros/outros. Tighten loose paragraphs.
Return the polished version as a JSON object with keys 'title', 'excerpt', and 'content'. Output ONLY the JSON.`;

        const factCheckedRaw = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', refinerPrompt);
        const factChecked = parseJson(factCheckedRaw);
        console.log(`[Stage 3] Fact-check complete.`);

        // STAGE 4: Lead editor polish — POV, AI-isms, hook/CTA
        const editorPrompt = `You are the Lead Editor at PickMyBinge performing a final polish pass.
Review this article and fix the following:
${JSON.stringify(factChecked)}

Checklist:
1. POV consistency — enforce second-person ("you") throughout, remove first-person slippage
2. Remove AI-isms: "delve into", "it's worth noting", "at the end of the day", "in today's world", "game-changer", "paradigm shift"
3. Ensure every H3 header is present and not duplicated
4. Verify the article opens with a hook, not a generic statement
5. Ensure the closing paragraph ends on a strong call-to-action ("add it to your watchlist", "hit play tonight") — not a summary

Return the final version as a JSON object with keys 'title', 'excerpt', and 'content'. Output ONLY the JSON.`;

        const polishedRaw = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', editorPrompt);
        const polished = parseJson(polishedRaw);
        console.log(`[Stage 4] Lead editor polish complete.`);

        // STAGE 5: Post-process, save, deploy
        const cleanContent = postProcess(polished.content);

        const date = new Date().toISOString().split('T')[0];
        const slug = vertical.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${date}-${slug}.json`;
        const filePath = path.join(BLOG_DIR, fileName);

        const newPost = {
            id: `${date}-${slug}`,
            date,
            vertical,
            persona: personaName,
            title: polished.title,
            excerpt: polished.excerpt,
            content: cleanContent,
            link: `/blog.html?id=${date}-${slug}`
        };

        fs.writeFileSync(filePath, JSON.stringify(newPost, null, 4));

        // Update manifest
        const manifestPath = path.join(BLOG_DIR, 'manifest.json');
        let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : [];
        if (!manifest.includes(fileName)) {
            manifest.unshift(fileName);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        // Update blogs-index
        const existingIndex = fs.existsSync(BLOGS_INDEX) ? JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')) : [];
        if (!existingIndex.find(p => p.id === newPost.id)) {
            const { content: _, ...postMeta } = newPost;
            existingIndex.unshift(postMeta);
            fs.writeFileSync(BLOGS_INDEX, JSON.stringify(existingIndex, null, 4));
        }

        console.log(`[Stage 5] Saved: ${fileName}`);

        await autoDeploy(date);
        return true;
    } catch (error) {
        console.error('CRITICAL: Pipeline failed:', error.message);
        return false;
    }
}

runPipeline();
