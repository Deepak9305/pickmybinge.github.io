import fs from 'fs';
import path from 'path';

/**
 * Autonomous Blog Generation Pipeline (ESM)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'src/content/blogs');

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

async function runPipeline() {
    try {
        if (!GROQ_API_KEY) {
            console.error('GROQ_API_KEY is missing. Skipping pipeline.');
            return;
        }

        // STEP 1: KEYWORD RESEARCH
        const keywordPrompt = "Find a mid-high volume, low competition keyword related to 'binge-worthy' movies, TV shows, or K-dramas for April 2026. Focus on 'discovery' (hidden gems). Return only the keyword.";
        const keyword = await callGroq('meta-llama/llama-4-scout-17b-16e-instruct', keywordPrompt);
        console.log(`Target Keyword: ${keyword}`);

        // STEP 2: RESEARCH & DRAFTING
        const writingPrompt = `Research and write a comprehensive, high-authority blog post about '${keyword}' for the entertainment site 'PickMyBinge'.
        
        Brand Context: PickMyBinge is the discovery tool for movies, TV shows, and K-dramas. We focus on "finding your next obsession" and avoiding the scroll. We also have an edgy "Cringe Zone" for intentionally bad movies.
        
        Tone: Enthusiastic, witty, expert, and binge-focused. 
        Length: Approx 800 words.
        Include:
        - A catchy, SEO-optimized title.
        - An engaging summary (excerpt).
        - A "Binge Score" out of 10.
        - Detailed recommendations.
        - Internal links placeholder to genres.
        
        Requirement: The output must ONLY be a JSON object with keys 'title', 'excerpt', and 'content'.`;

        const draftJson = await callGroq('openai/gpt-oss-120b', writingPrompt);
        let draft = JSON.parse(draftJson.replace(/```json|```/g, ''));

        // STEP 3: FACT-CHECK & REFINE
        const refinerPrompt = `Fact-check and refine the following blog post about '${keyword}'. 
        Ensure all movie dates and details are technically accurate for 2026. 
        Fix any repetitive phrasing. 
        Return the final version as a JSON object with keys 'title', 'excerpt', and 'content'.
        Post: ${JSON.stringify(draft)}`;

        const finalJson = await callGroq('meta-llama/llama-4-scout-17b-16e-instruct', refinerPrompt);
        let finalPost = JSON.parse(finalJson.replace(/```json|```/g, ''));

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
        const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${date}-${slug}.json`;
        const filePath = path.join(BLOG_DIR, fileName);

        fs.writeFileSync(filePath, JSON.stringify({
            date: date,
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            content: finalPost.content,
            link: `/blog/${slug}`
        }, null, 4));

        console.log(`Successfully published blog: ${fileName}`);

    } catch (error) {
        console.error('Pipeline failed:', error);
    }
}

runPipeline();
