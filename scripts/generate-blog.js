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

// ─── Deep-Dive Topic Catalogue ────────────────────────────────────────────────
// type: 'deep-dive' — no TMDB needed, AI writes from knowledge.
// These target specific long-tail questions fans actively Google.
// subtopics: guiding H2 sections the AI should cover.

const DEEP_DIVES = [
    // ── Anime ──────────────────────────────────────────────────────────────────
    {
        id: 'frieren-himmel-hero-sword',
        type: 'deep-dive',
        keyword: 'why couldn\'t Himmel pull the hero sword Frieren',
        subject: 'Himmel the Hero from Frieren: Beyond Journey\'s End',
        franchise: 'Frieren: Beyond Journey\'s End',
        subtopics: ['The criteria for pulling the hero sword', 'Why Himmel failed the sword\'s test', 'What Himmel\'s failure reveals about his character', 'The cruel irony — was Himmel truly not a hero?'],
        category: 'anime',
        tags: ['frieren', 'anime', 'himmel', 'character-analysis', 'manga']
    },
    {
        id: 'sukuna-true-power',
        type: 'deep-dive',
        keyword: 'how powerful is Ryomen Sukuna Jujutsu Kaisen',
        subject: 'Ryomen Sukuna\'s true power in Jujutsu Kaisen',
        franchise: 'Jujutsu Kaisen',
        subtopics: ['Sukuna\'s cursed energy capacity', 'Shrine and Malevolent Kitchen techniques', 'His 20-finger vs 15-finger power gap', 'How he compares to Gojo and other special grade sorcerers'],
        category: 'anime',
        tags: ['jujutsu-kaisen', 'anime', 'sukuna', 'power-levels', 'manga']
    },
    {
        id: 'gear-5-luffy-explained',
        type: 'deep-dive',
        keyword: 'Luffy Gear 5 powers explained One Piece',
        subject: 'Luffy\'s Gear 5 and the Sun God Nika awakening',
        franchise: 'One Piece',
        subtopics: ['What is Gear 5 and the Mythical Zoan awakening', 'Why the World Government feared this power for 800 years', 'Gear 5\'s "cartoon logic" combat and its limits', 'How Gear 5 changes One Piece\'s power ceiling'],
        category: 'anime',
        tags: ['one-piece', 'anime', 'luffy', 'gear-5', 'devil-fruit', 'manga']
    },
    {
        id: 'eren-yeager-motives',
        type: 'deep-dive',
        keyword: 'why did Eren start the Rumbling Attack on Titan',
        subject: 'Eren Yeager\'s true motives and the Rumbling in Attack on Titan',
        franchise: 'Attack on Titan',
        subtopics: ['When Eren\'s ideology shifted', 'The paradox of freedom — was Eren ever free?', 'The "I was doing this all along" time loop theory', 'Was Eren a villain, a hero, or both?'],
        category: 'anime',
        tags: ['attack-on-titan', 'anime', 'eren', 'rumbling', 'character-analysis']
    },
    {
        id: 'tanjiro-sun-breathing',
        type: 'deep-dive',
        keyword: 'why can Tanjiro use Sun-Breathing Demon Slayer',
        subject: 'Tanjiro Kamado\'s connection to Yoriichi and Sun-Breathing',
        franchise: 'Demon Slayer',
        subtopics: ['The Hinokami Kagura and its true origin', 'The Kamado family\'s secret lineage', 'Why Tanjiro\'s Hanafuda earrings matter', 'How Sun-Breathing differs from all other styles'],
        category: 'anime',
        tags: ['demon-slayer', 'anime', 'tanjiro', 'sun-breathing', 'manga']
    },
    {
        id: 'chainsaw-man-pochita-explained',
        type: 'deep-dive',
        keyword: 'who is Pochita and why is Chainsaw Man so powerful',
        subject: 'Pochita the Chainsaw Devil and Denji\'s true power in Chainsaw Man',
        franchise: 'Chainsaw Man',
        subtopics: ['Why the Chainsaw Devil is feared by all other devils', 'The ability to erase concepts from existence', 'Pochita\'s relationship with Denji', 'What Chainsaw Man\'s power means for the story\'s future'],
        category: 'anime',
        tags: ['chainsaw-man', 'anime', 'pochita', 'denji', 'devil-powers', 'manga']
    },
    {
        id: 'sung-jinwoo-power-levels',
        type: 'deep-dive',
        keyword: 'how powerful is Sung Jin-Woo Solo Leveling',
        subject: 'Sung Jin-Woo\'s power progression and shadow army in Solo Leveling',
        franchise: 'Solo Leveling',
        subtopics: ['From E-rank to Shadow Monarch — the full journey', 'The true scope of the Shadow Army', 'Sung Jin-Woo vs the Monarchs', 'Is he the strongest being in the Solo Leveling universe?'],
        category: 'anime',
        tags: ['solo-leveling', 'anime', 'sung-jinwoo', 'shadow-monarch', 'power-levels']
    },
    {
        id: 'hunter-x-hunter-nen-explained',
        type: 'deep-dive',
        keyword: 'HxH Nen system fully explained Hunter x Hunter',
        subject: 'The Nen system in Hunter x Hunter — all 6 types explained',
        franchise: 'Hunter x Hunter',
        subtopics: ['The 6 Nen categories and their strengths', 'How Nen vows and limitations multiply power', 'The most broken Nen abilities in the series', 'Why Nen makes HxH\'s power system the best in anime'],
        category: 'anime',
        tags: ['hunter-x-hunter', 'anime', 'nen', 'power-system', 'manga']
    },
    {
        id: 'mob-psycho-mob-true-power',
        type: 'deep-dive',
        keyword: 'how powerful is Mob Mob Psycho 100 true power explained',
        subject: 'Shigeo "Mob" Kageyama\'s true psychic power in Mob Psycho 100',
        subtopics: ['What happens when Mob reaches 100%', 'The ???% phenomenon — what triggers it', 'Mob vs Tatsumaki: who wins?', 'Why Mob\'s emotional suppression is the real plot device'],
        franchise: 'Mob Psycho 100',
        category: 'anime',
        tags: ['mob-psycho', 'anime', 'mob', 'psychic-powers', 'esper']
    },
    {
        id: 'bleach-ichigo-true-nature',
        type: 'deep-dive',
        keyword: 'Ichigo true nature and powers explained Bleach TYBW',
        subject: 'Ichigo Kurosaki\'s true nature — Shinigami, Quincy, Hollow and Fullbring',
        franchise: 'Bleach',
        subtopics: ['The four natures of Ichigo\'s soul', 'Why Ichigo\'s Zanpakuto is actually two swords', 'The truth about his mother Masaki', 'Where Ichigo\'s power ceiling truly is in TYBW'],
        category: 'anime',
        tags: ['bleach', 'anime', 'ichigo', 'true-power', 'tybw', 'manga']
    },
    {
        id: 'dragon-ball-ultra-instinct-explained',
        type: 'deep-dive',
        keyword: 'Ultra Instinct explained Dragon Ball Super',
        subject: 'Ultra Instinct — what it is and why it\'s Dragon Ball\'s ultimate technique',
        franchise: 'Dragon Ball Super',
        subtopics: ['What Ultra Instinct actually does to the body', 'Why even Gods of Destruction can\'t master it', 'Goku\'s version vs the true Autonomous Ultra Instinct', 'How it compares to other God-tier transformations'],
        category: 'anime',
        tags: ['dragon-ball', 'anime', 'ultra-instinct', 'goku', 'power-levels']
    },
    {
        id: 'jjk-gojo-infinity-explained',
        type: 'deep-dive',
        keyword: 'Gojo Infinity technique explained Jujutsu Kaisen',
        subject: 'Satoru Gojo\'s Infinity — why it makes him virtually invincible',
        franchise: 'Jujutsu Kaisen',
        subtopics: ['How Infinity works mathematically (Zeno\'s paradox)', 'What can actually bypass Infinity', 'Hollow Purple and the Unlimited Void', 'Why Gojo is considered the strongest sorcerer alive'],
        category: 'anime',
        tags: ['jujutsu-kaisen', 'anime', 'gojo', 'infinity', 'cursed-technique']
    },

    // ── Marvel ─────────────────────────────────────────────────────────────────
    {
        id: 'knull-power-explained',
        type: 'deep-dive',
        keyword: 'how powerful is Knull God of Symbiotes Marvel',
        subject: 'Knull the God of the Symbiotes — full power breakdown',
        franchise: 'Marvel Comics',
        subtopics: ['Knull\'s origin and the Void before creation', 'The King in Black — controlling all symbiotes', 'Necrosword: the weapon that killed Celestials', 'Where Knull ranks on Marvel\'s cosmic power scale'],
        category: 'comics',
        tags: ['marvel', 'knull', 'symbiotes', 'king-in-black', 'cosmic-entities', 'comics']
    },
    {
        id: 'galactus-true-power',
        type: 'deep-dive',
        keyword: 'how powerful is Galactus Marvel true power',
        subject: 'Galactus — the true scale of the Devourer of Worlds',
        franchise: 'Marvel Comics',
        subtopics: ['What Galactus actually is (not just a villain)', 'The Power Cosmic and what it can do', 'Why Galactus has never truly been defeated', 'Galactus vs Thanos, Knull, and the Celestials'],
        category: 'comics',
        tags: ['marvel', 'galactus', 'power-cosmic', 'cosmic-entities', 'comics']
    },
    {
        id: 'molecule-man-strongest-marvel',
        type: 'deep-dive',
        keyword: 'is Molecule Man the strongest Marvel character',
        subject: 'Owen Reece the Molecule Man — Marvel\'s most secretly broken character',
        franchise: 'Marvel Comics',
        subtopics: ['What Molecule Man can actually do at full power', 'His role in Secret Wars 2015 and the Multiverse', 'Why the Beyonders created him as a bomb', 'The case for Molecule Man being Marvel\'s most powerful being'],
        category: 'comics',
        tags: ['marvel', 'molecule-man', 'secret-wars', 'cosmic-power', 'comics']
    },
    {
        id: 'darkseid-vs-thanos',
        type: 'deep-dive',
        keyword: 'Darkseid vs Thanos who wins who is stronger',
        subject: 'Darkseid vs Thanos — the definitive breakdown',
        franchise: 'DC & Marvel Comics',
        subtopics: ['Darkseid\'s Omega Beams and the Anti-Life Equation', 'Thanos with and without the Infinity Gauntlet', 'True Form Darkseid vs Astral Regulator Thanos', 'Who wins in a straight fight — and why'],
        category: 'comics',
        tags: ['darkseid', 'thanos', 'dc', 'marvel', 'comics', 'versus', 'power-levels']
    },
    {
        id: 'phoenix-force-explained',
        type: 'deep-dive',
        keyword: 'Phoenix Force explained Marvel Comics X-Men',
        subject: 'The Phoenix Force — Marvel\'s most destructive cosmic entity explained',
        franchise: 'Marvel Comics',
        subtopics: ['What the Phoenix Force actually is', 'Why it keeps choosing Jean Grey', 'Dark Phoenix vs White Phoenix of the Crown', 'Every host ranked by power and stability'],
        category: 'comics',
        tags: ['marvel', 'phoenix-force', 'jean-grey', 'x-men', 'cosmic-entities', 'comics']
    },
    {
        id: 'one-above-all-explained',
        type: 'deep-dive',
        keyword: 'who is the One Above All Marvel most powerful being',
        subject: 'The One Above All — Marvel\'s omnipotent supreme being explained',
        franchise: 'Marvel Comics',
        subtopics: ['What the One Above All represents', 'The difference between One Above All and One-Above-All', 'Has anyone ever fought the One Above All?', 'Where they stand vs DC\'s The Presence'],
        category: 'comics',
        tags: ['marvel', 'one-above-all', 'omnipotent', 'cosmic-entities', 'comics']
    },

    // ── DC ─────────────────────────────────────────────────────────────────────
    {
        id: 'doctor-manhattan-powers-limits',
        type: 'deep-dive',
        keyword: 'Doctor Manhattan powers and limits explained Watchmen',
        subject: 'Doctor Manhattan — every power explained and where his limits lie',
        franchise: 'DC / Watchmen',
        subtopics: ['Restructuring matter and his tachyon-based perception of time', 'Why Doctor Manhattan "lost" to Ozymandias', 'His role in Doomsday Clock and DC continuity', 'Is Doctor Manhattan truly omnipotent?'],
        category: 'comics',
        tags: ['dc', 'doctor-manhattan', 'watchmen', 'omnipotence', 'comics']
    },
    {
        id: 'darkseid-anti-life-equation',
        type: 'deep-dive',
        keyword: 'what is the Anti-Life Equation Darkseid DC explained',
        subject: 'The Anti-Life Equation — Darkseid\'s ultimate weapon explained',
        franchise: 'DC Comics',
        subtopics: ['What the Anti-Life Equation mathematically is', 'Why Darkseid has spent millennia searching for it', 'What happens when it\'s used on the entire universe', 'Every time the Anti-Life Equation appeared in DC history'],
        category: 'comics',
        tags: ['dc', 'darkseid', 'anti-life-equation', 'new-gods', 'comics']
    },

    // ── Movies / TV ────────────────────────────────────────────────────────────
    {
        id: 'inception-ending-explained',
        type: 'deep-dive',
        keyword: 'Inception ending explained is Cobb still dreaming',
        subject: 'Inception\'s ending — definitive breakdown of what really happened',
        franchise: 'Inception (2010)',
        subtopics: ['The spinning top — what it actually proves', 'Cobb\'s wedding ring as the real tell', 'Christopher Nolan\'s intentional ambiguity', 'Why the answer might be "it doesn\'t matter"'],
        category: 'movies',
        tags: ['inception', 'christopher-nolan', 'ending-explained', 'theory', 'movies']
    },
    {
        id: 'breaking-bad-walter-white-transformation',
        type: 'deep-dive',
        keyword: 'Walter White transformation from good to evil Breaking Bad',
        subject: 'Walter White\'s transformation in Breaking Bad — when did he become Heisenberg?',
        franchise: 'Breaking Bad',
        subtopics: ['The Gray Matter wound as the real origin of Heisenberg', 'The exact moment Walt chose ego over family', 'Was Walt always Heisenberg, or did power create him?', 'Why "I did it for me" is the most honest line in TV history'],
        category: 'tv',
        tags: ['breaking-bad', 'walter-white', 'heisenberg', 'character-analysis', 'tv-shows']
    },
    {
        id: 'dark-netflix-ending-explained',
        type: 'deep-dive',
        keyword: 'Dark Netflix ending explained season 3 time loop',
        subject: 'Dark Season 3 ending — the knot, the origin, and what it all means',
        franchise: 'Dark (Netflix)',
        subtopics: ['The knot vs the origin world explained', 'Why Eva and Adam were both wrong', 'The paradox of the apocalypse causing itself', 'Who survived and why — the full breakdown'],
        category: 'tv',
        tags: ['dark', 'netflix', 'ending-explained', 'time-travel', 'tv-shows']
    },
    {
        id: 'interstellar-ending-explained',
        type: 'deep-dive',
        keyword: 'Interstellar ending explained the tesseract Cooper',
        subject: 'Interstellar\'s ending — the tesseract, gravity, and love as a dimension explained',
        franchise: 'Interstellar (2014)',
        subtopics: ['What the tesseract actually is and who built it', 'How Cooper communicates across time through gravity', 'The "they" reveal — future humans explained', 'Does Interstellar hold up scientifically?'],
        category: 'movies',
        tags: ['interstellar', 'christopher-nolan', 'ending-explained', 'sci-fi', 'movies']
    },
    {
        id: 'game-of-thrones-dany-mad-queen',
        type: 'deep-dive',
        keyword: 'why did Daenerys go mad in Game of Thrones explained',
        subject: 'Daenerys Targaryen\'s turn — was the Mad Queen arc earned or rushed?',
        franchise: 'Game of Thrones',
        subtopics: ['The foreshadowing the show planted from Season 1', 'What the books set up that the show skipped', 'The case for and against it being a good story decision', 'Why the execution failed even if the idea wasn\'t wrong'],
        category: 'tv',
        tags: ['game-of-thrones', 'daenerys', 'mad-queen', 'character-analysis', 'tv-shows']
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
                const nicheSlug = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(json|html)$/, '');
                used.add(nicheSlug);
            }
        } catch { }
    }

    // Check drafts folder
    if (fs.existsSync(DRAFTS_DIR)) {
        for (const file of fs.readdirSync(DRAFTS_DIR)) {
            if (file.endsWith('.json') || file.endsWith('.html')) {
                const nicheSlug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(json|html)$/, '');
                used.add(nicheSlug);
            }
        }
    }

    return used;
}

const ALL_TOPICS = [...NICHES, ...DEEP_DIVES];

function selectTopic(overrideId) {
    if (overrideId) {
        // Check predefined catalogue first
        const found = ALL_TOPICS.find(t => t.id === overrideId || (t.label || '').toLowerCase() === overrideId.toLowerCase());
        if (found) return found;

        // Treat as free-form topic — build an ad-hoc deep-dive object
        console.log(`  → "${overrideId}" not in catalogue — treating as custom topic.`);
        const slug = overrideId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return {
            id: slug,
            type: 'deep-dive',
            keyword: overrideId,
            subject: overrideId,
            franchise: 'Various',
            subtopics: [],   // AI will decide its own structure
            category: 'general',
            tags: slug.split('-').filter(w => w.length > 2)
        };
    }

    const usedIds = getUsedNicheIds();
    console.log(`  → Topics used so far: ${usedIds.size}`);

    let candidates = ALL_TOPICS.filter(t => !usedIds.has(t.id));
    if (candidates.length === 0) {
        console.log('  → All topics covered — cycling from the beginning.');
        candidates = ALL_TOPICS;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Groq Helpers ─────────────────────────────────────────────────────────────

async function extractFranchiseFromKeyword(keyword) {
    try {
        const raw = await callGroqWithRetry(
            'llama-3.3-70b-versatile',
            `What is the primary show, movie, or franchise this topic is about? Topic: "${keyword}"\nReturn JSON only: { "franchise": "<name>" }`,
            2, 100
        );
        const parsed = parseJson(raw);
        return parsed.franchise || null;
    } catch {
        return null;
    }
}

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
  <meta name="persona" content="${post.persona || ''}">
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

// ─── Deep-Dive Pipeline ───────────────────────────────────────────────────────

async function runDeepDivePipeline(topic) {
    const MODEL = 'llama-3.3-70b-versatile';

    try {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  Deep-Dive: ${topic.subject}`);
        console.log(`  Keyword:   ${topic.keyword}`);
        console.log(`${'─'.repeat(60)}`);

        if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `${formattedDate}-${topic.id}.html`;
        const fileId = `${formattedDate}-${topic.id}`;

        if (fs.existsSync(path.join(DRAFTS_DIR, fileName))) {
            console.log(`  ℹ️  Draft for ${fileId} already exists — skipping.`);
            return true;
        }

        // ── STEP 0: TMDB imagery (best-effort — skip gracefully if unavailable) ─
        let tmdbImages = [];
        if (TMDB_API_KEY) {
            try {
                console.log('\n[STEP 0] Searching TMDB for imagery...');
                let tmdbQuery = (topic.franchise && topic.franchise !== 'Various')
                    ? topic.franchise
                    : (await extractFranchiseFromKeyword(topic.keyword)) || topic.keyword;
                console.log(`  → TMDB search query: "${tmdbQuery}"`);
                const searchRes = await fetchFromTMDB('search/multi', { query: tmdbQuery, language: 'en-US', page: 1 });
                const candidates = (searchRes.results || [])
                    .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
                    .slice(0, 5);
                if (candidates.length > 0) {
                    const enriched = await Promise.all(
                        candidates.map(r => fetchEnrichedItem(r.id, r.media_type === 'movie' ? 'movie' : 'tv'))
                    );
                    tmdbImages = enriched.filter(t => t.poster);
                    console.log(`  → ${tmdbImages.length} titles with posters found.`);
                } else {
                    console.log('  → No TMDB results with posters — proceeding without images.');
                }
            } catch (e) {
                console.log(`  → TMDB imagery skipped: ${e.message}`);
            }
        }

        const persona = pickPersona();
        console.log(`\n[STEP 1] Writing article (persona: ${persona.name})...`);

        const subtopicList = topic.subtopics.length > 0
            ? `Cover each of these subtopics as separate <h2> sections:\n${topic.subtopics.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
            : `Choose 3–5 relevant <h2> sections yourself that best answer the topic. Pick angles a knowledgeable fan would want covered.`;

        const imageBlock = tmdbImages.length > 0
            ? `\nTMDB REFERENCE IMAGES — for each title below that you mention in your article, embed its poster immediately after its <h2> heading using this exact HTML (no changes to the URL):\n<img loading="lazy" src="[exact URL]" alt="[Title] poster" class="blog-image">\n\n${tmdbImages.map(t => `Title: ${t.title} (${(t.release_date || '').substring(0, 4)})\nPoster URL: ${t.poster}\nTMDB Link: ${t.tmdb_link}`).join('\n\n')}\n`
            : '';

        const writingPrompt = `${persona.voice}

You are writing a deep-dive feature article for PickMyBinge targeting this exact search query:
"${topic.keyword}"

Subject: ${topic.subject}
Franchise: ${topic.franchise}
${imageBlock}
ARTICLE STRUCTURE (follow exactly):
1. HOOK — 2 punchy paragraphs. Immediately give the reader a direct answer to "${topic.keyword}", then explain why the full story is more interesting than they think. NO generic openers.
2. ${subtopicList}
3. <h2>The Verdict</h2> — 1-2 paragraphs with a clear definitive take + your personal rating of how well the franchise handles this concept
4. <h2>Watch/Read Next</h2> — recommend 3 specific titles (with brief reasons) that fans of this topic will love

STRICT RULES:
- Output ONLY a valid JSON object: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }
- "title": punchy SEO title under 70 chars that directly targets the keyword — it must answer or tease the question
- "excerpt": vivid 1-sentence hook under 160 chars — make someone desperate to read
- "content": full article as HTML string — no <html>/<body>/<style> tags, no inline styles
- "persona": the persona id ("BINGER", "CRITIC", or "NOSTALGIA")
- Minimum 1200 words
- Write from deep knowledge of the franchise — be specific, cite chapter/episode numbers where relevant, reference actual events
- BANNED PHRASES: "will keep you on the edge of your seat", "in the world of", "buckle up", "it's worth noting", "delve into", "dive into", "needless to say", "in conclusion", "at the end of the day"`;

        const draftRaw = await callGroqWithRetry(MODEL, writingPrompt, 3, 8000);
        const draft = parseJson(draftRaw);
        console.log(`  → Draft written by persona: ${draft.persona || persona.id}`);

        console.log('\n[STEP 2] Editorial polish...');

        const imageAudit = tmdbImages.length > 0
            ? `\nIMAGE AUDIT (fix silently):\n${tmdbImages.map((t, i) => `${i + 1}. If "${t.title}" appears in the article, its poster <img loading="lazy" src="${t.poster}" alt="${t.title} poster" class="blog-image"> must appear immediately after its <h2> heading. Add it if missing.`).join('\n')}\n`
            : '';

        const reviewPrompt = `You are a Senior Editor at PickMyBinge. Raise the quality of this deep-dive article.

DRAFT:
${JSON.stringify(draft)}

TARGET KEYWORD: "${topic.keyword}"
SUBJECT: ${topic.subject}
${imageAudit}
QUALITY AUDIT (fix silently):
1. Title — does it directly answer or strongly tease "${topic.keyword}"? Under 70 chars? Rewrite if not.
2. Excerpt — vivid hook under 160 chars? Rewrite if bland.
3. Hook — does it immediately answer the question then pull the reader deeper? Fix if generic.
4. Specificity — are there real episode numbers, chapter references, character quotes, specific events? Add them where missing.
5. Each H2 section — is it substantial (150+ words) with concrete analysis, not vague claims?
6. Banned phrases to remove: "will keep you on the edge of your seat", "in the world of", "it's worth noting", "delve into", "needless to say"
7. Verdict and Watch/Read Next sections — do they exist and are they strong?

Return ONLY the corrected JSON: { "title": "...", "excerpt": "...", "content": "...", "persona": "..." }`;

        const polishedRaw = await callGroqWithRetry(MODEL, reviewPrompt, 3, 8000);
        const polished = parseJson(polishedRaw);
        console.log('  → Polish complete.');

        const missing = ['title', 'excerpt', 'content'].filter(k => !polished[k]);
        if (missing.length > 0) throw new Error(`Polished post missing fields: ${missing.join(', ')}`);

        polished.content = cleanHtml(polished.content);

        const now2 = now;
        const firstThumb = tmdbImages.length > 0 ? tmdbImages[0].poster : null;
        const newPost = {
            id: fileId,
            date: `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(now2.getDate()).padStart(2, '0')}`,
            title: polished.title,
            excerpt: polished.excerpt,
            persona: polished.persona || persona.id,
            category: topic.category,
            tags: topic.tags,
            thumbnail: firstThumb,
            tmdb_ids: tmdbImages.map(t => t.id),
            readTimeMinutes: estimateReadTime(polished.content),
            content: polished.content,
            link: `/blog.html?id=${fileId}`
        };

        fs.writeFileSync(path.join(DRAFTS_DIR, fileName), buildHtmlDraft(newPost));
        console.log(`  → Draft saved: drafts/${fileName}`);
        console.log(`  → To publish: run "Publish Blog Draft" action with filename: ${fileName}`);

        console.log(`\n✅ Deep-dive complete: ${fileId} [persona: ${newPost.persona}]`);
        return true;

    } catch (error) {
        console.error(`\n❌ Deep-dive failed for "${topic.subject}":`, error.message);
        return false;
    }
}

// ─── Genre-Review Pipeline ────────────────────────────────────────────────────

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
        const fileName = `${formattedDate}-${niche.id}.html`;
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
            thumbnail: enrichedContent.find(t => t.poster)?.poster || null,
            tmdb_ids: enrichedContent.map(item => item.id),
            readTimeMinutes: estimateReadTime(polished.content),
            content: polished.content,
            link: `/blog.html?id=${fileId}`
        };

        fs.writeFileSync(path.join(DRAFTS_DIR, fileName), buildHtmlDraft(newPost));
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
    console.log('\nPickMyBinge Blog Pipeline v5');

    const topic = selectTopic(process.env.BLOG_NICHE || '');
    const label = topic.label || topic.subject;
    console.log(`Generating 1 post for: ${label} (${topic.id}) [type: ${topic.type || 'genre-review'}]\n`);

    const ok = topic.type === 'deep-dive'
        ? await runDeepDivePipeline(topic)
        : await runPipeline(topic);

    console.log('\n─── Final Result ───');
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    console.log('────────────────────\n');

    process.exit(ok ? 0 : 1);
}

main();
