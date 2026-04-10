import fs from 'fs';
import path from 'path';

/**
 * Autonomous Blog Generation Pipeline (ESM)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');

async function callGroq(model, prompt) {
    console.log(`Calling Groq with model: ${model}...`);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(`Groq API Error: ${data.error.message}`);
    return data.choices[0].message.content;
}

// Helper to parse JSON from potential markdown code blocks
function parseJson(str) {
    try {
        const jsonMatch = str.match(/```json\n([\s\S]*?)\n```/) || str.match(/```([\s\S]*?)```/) || [null, str];
        return JSON.parse(jsonMatch[1].trim());
    } catch (e) {
        console.error("Failed to parse JSON. Raw string:", str);
        throw new Error("Mismatched JSON format from LLM");
    }
}

async function runPipeline() {
    try {
        console.log("Starting Blog Generation Pipeline...");
        if (!GROQ_API_KEY) {
            console.error('CRITICAL: GROQ_API_KEY is missing. Environment check failed.');
            return;
        }

        // Ensure directories exist
        if (!fs.existsSync(BLOG_DIR)) {
            console.log(`Creating missing directory: ${BLOG_DIR}`);
            fs.mkdirSync(BLOG_DIR, { recursive: true });
        }

        // STEP 1: KEYWORD RESEARCH
        const keywordPrompt = "Find a mid-high volume, low competition keyword related to 'binge-worthy' movies, TV shows, or K-dramas for April 2026. Focus on 'discovery' (hidden gems). Return only the keyword.";
        const keyword = await callGroq('meta-llama/llama-4-scout-17b-16e-instruct', keywordPrompt);
        const cleanKeyword = keyword.trim().replace(/^"|"$/g, '');
        console.log(`Target Keyword: ${cleanKeyword}`);

        // STEP 2: RESEARCH & DRAFTING
        const writingPrompt = `Research and write a professional, high-authority movie/TV show analysis about '${cleanKeyword}' for the publication 'PickMyBinge'.
        
        Publication Tone: Professional, analytical, and highly informative. Style should match industry-leading publications like Variety or The Hollywood Reporter. Focus on objective facts, critical analysis of performances, and cultural significance.
        
        Length: Approx 800 words.
        Include:
        - A professional, SEO-optimized headline.
        - An authoritative executive summary (excerpt).
        - Deep-dive analysis of plot, direction, and acting.
        - Technical details (release date, studio, cast).
        - Internal links placeholder for relevant categories (Action, Comedy, Horror, Korean).
        
        Requirement: The output must ONLY be a JSON object with keys 'title', 'excerpt', and 'content'.`;

        const draftRaw = await callGroq('openai/gpt-oss-120b', writingPrompt);
        const draft = parseJson(draftRaw);

        // STEP 3: FACT-CHECK & REFINE
        const refinerPrompt = `Fact-check and refine the following blog post about '${cleanKeyword}'. 
        Ensure all movie dates and details are technically accurate for 2026. 
        Fix any repetitive phrasing. 
        Return the final version as a JSON object with keys 'title', 'excerpt', and 'content'.
        Post: ${JSON.stringify(draft)}`;

        const finalRaw = await callGroq('meta-llama/llama-4-scout-17b-16e-instruct', refinerPrompt);
        const finalPost = parseJson(finalRaw);

        // STEP 4: AUTO-LINKER (Internal/External)
        const linkMappings = {
            'Comedy': '/?genre=comedy',
            'Action': '/?genre=action',
            'Horror': '/?genre=horror',
            'Korean': '/?genre=korean',
            'TMDB': 'https://www.themoviedb.org/'
        };

        Object.keys(linkMappings).forEach(key => {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            finalPost.content = finalPost.content.replace(regex, `<a href="${linkMappings[key]}">${key}</a>`);
        });

        // STEP 5: SAVE
        const date = new Date().toISOString().split('T')[0];
        const slug = cleanKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${date}-${slug}.json`;
        const filePath = path.join(BLOG_DIR, fileName);

        const newPost = {
            id: `${date}-${slug}`,
            date: date,
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            content: finalPost.content,
            link: `/blog.html?id=${date}-${slug}`
        };

        fs.writeFileSync(filePath, JSON.stringify(newPost, null, 4));

        // Update manifest.json
        const manifestPath = path.join(BLOG_DIR, 'manifest.json');
        let manifest = [];
        if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        }
        if (!manifest.includes(fileName)) {
            manifest.unshift(fileName);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        // Update blogs-index.json so home page and blog.html stay in sync
        const existingIndex = fs.existsSync(BLOGS_INDEX)
            ? JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8'))
            : [];

        // Check if post already in index
        if (!existingIndex.find(p => p.id === newPost.id)) {
            const { content: _content, ...postMeta } = newPost;
            existingIndex.unshift(postMeta);
            fs.writeFileSync(BLOGS_INDEX, JSON.stringify(existingIndex, null, 4));
        }

        console.log(`Successfully published blog: ${fileName}`);

    } catch (error) {
        console.error('CRITICAL: Pipeline failed:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

runPipeline();
