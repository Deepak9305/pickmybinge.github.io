import { useState, useEffect, useRef } from 'react';
import './App.css';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const RESULTS_PER_LOAD = 8;

const genreMappings = {
    'comedy': { movie: '35', tv: '35' },
    'action': { movie: '28', tv: '10759' },
    'drama': { movie: '18', tv: '18' },
    'sci-fi': { movie: '878', tv: '10765' },
    'thriller': { movie: '53', tv: '80' },
    'animation': { movie: '16', tv: '16' },
    'horror': { movie: '27', tv: '99' },
    'romance': { movie: '10749', tv: '10749' }
};
const languageMappings = { 'korean': 'ko' };

// We will now fetch blogs from /blogs-index.json instead of eager globbing for better performance

function App() {
    const [allFetchedResults, setAllFetchedResults] = useState([]);
    const [displayedResultsCount, setDisplayedResultsCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [currentQuery, setCurrentQuery] = useState('');
    const [isTextSearch, setIsTextSearch] = useState(false);
    const [totalApiPages, setTotalApiPages] = useState(1);
    const [activeFilters, setActiveFilters] = useState(new Set());
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Blog state
    const [blogs, setBlogs] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [apiError, setApiError] = useState(null);

    useEffect(() => {
        const init = async () => {
            console.log("App initializing...");
            try {
                await Promise.all([
                    searchEntertainment(null, true),
                    loadBlogs()
                ]);
                console.log("Initialization complete.");
            } catch (err) {
                console.error("Initialization failed:", err);
                setApiError("Failed to load initial data. Please check your connection.");
            } finally {
                setIsInitialLoading(false);
            }
        };
        init();
    }, []);

    const loadBlogs = async () => {
        try {
            const res = await fetch('/blogs-index.json');
            if (!res.ok) throw new Error("Blog index not found");
            const loadedBlogs = await res.json();

            // Sort by date descending
            loadedBlogs.sort((a, b) => new Date(b.date) - new Date(a.date));
            setBlogs(loadedBlogs);
        } catch (err) {
            console.error("Failed to load blogs:", err);
            // Fallback or empty state
            setBlogs([]);
        }
    };

    const shuffleArray = (array) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    };

    const fetchData = async (type, query, page, isText) => {
        const params = new URLSearchParams({
            api_key: TMDB_API_KEY,
            page: page,
            'vote_count.gte': '150',
            'vote_average.gte': '6'
        });

        let url;
        if (isText) {
            url = `${TMDB_API_URL}/search/${type}`;
            params.append('query', query);
        } else {
            url = `${TMDB_API_URL}/discover/${type}`;
            params.append('sort_by', 'popularity.desc');

            const genreIds = [];
            const languageCodes = [];

            activeFilters.forEach(filter => {
                if (genreMappings[filter]?.[type]) genreIds.push(genreMappings[filter][type]);
                if (languageMappings[filter]) languageCodes.push(languageMappings[filter]);
            });

            if (genreIds.length > 0) params.append('with_genres', genreIds.join(','));
            if (languageCodes.length > 0) params.append('with_original_language', languageCodes.join('|'));
        }

        try {
            const response = await fetch(`${url}?${params.toString()}`);
            if (!response.ok) return [];
            const data = await response.json();
            setTotalApiPages(data.total_pages);
            return data.results.map(item => ({
                id: item.id,
                type: type,
                title: type === 'movie' ? item.title : item.name,
                year: (type === 'movie' ? item.release_date : item.first_air_date || '').substring(0, 4),
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/300x450/2D3047/8B8BA0?text=No+Image',
                rating: item.vote_average.toFixed(1)
            }));
        } catch (error) {
            console.error('Failed to fetch data:', error);
            return [];
        }
    };

    const searchEntertainment = async (query, isNewSearch = true) => {
        const page = isNewSearch ? 1 : currentPage;
        const isText = !!query;

        if (isNewSearch) {
            setCurrentPage(1);
            setAllFetchedResults([]);
            setDisplayedResultsCount(0);
        }

        let movies = [];
        let tvShows = [];

        if (typeFilter === 'all') {
            [movies, tvShows] = await Promise.all([
                fetchData('movie', query, page, isText),
                fetchData('tv', query, page, isText)
            ]);
        } else if (typeFilter === 'movie') {
            movies = await fetchData('movie', query, page, isText);
        } else if (typeFilter === 'tv') {
            tvShows = await fetchData('tv', query, page, isText);
        }

        const newResults = shuffleArray([...movies, ...tvShows]);
        if (isNewSearch) {
            setAllFetchedResults(newResults);
            setDisplayedResultsCount(Math.min(newResults.length, RESULTS_PER_LOAD));
        } else {
            setAllFetchedResults(prev => [...prev, ...newResults]);
            setDisplayedResultsCount(prev => prev + Math.min(newResults.length, RESULTS_PER_LOAD));
        }
    };

    const handleLoadMore = () => {
        if (displayedResultsCount < allFetchedResults.length) {
            setDisplayedResultsCount(prev => Math.min(prev + RESULTS_PER_LOAD, allFetchedResults.length));
        } else if (currentPage < totalApiPages) {
            const nextPage = currentPage + 1;
            setCurrentPage(nextPage);
            searchEntertainment(isTextSearch ? currentQuery : null, false);
        }
    };

    const handleBubbleClick = (filter) => {
        setSearchInput('');
        setIsTextSearch(false);
        const newFilters = new Set(activeFilters);

        if (filter === 'popular') {
            newFilters.clear();
        } else {
            if (newFilters.has(filter)) {
                newFilters.delete(filter);
            } else {
                if (newFilters.size >= 2) {
                    alert('You can select a maximum of 2 filters.');
                    return;
                }
                newFilters.add(filter);
            }
        }
        setActiveFilters(newFilters);
    };

    // Trigger search when filters change
    useEffect(() => {
        if (!isTextSearch) {
            searchEntertainment(null, true);
        }
    }, [activeFilters, typeFilter]);

    const triggerTextSearch = () => {
        const query = searchInput.trim();
        if (query) {
            setActiveFilters(new Set());
            setIsTextSearch(true);
            setCurrentQuery(query);
            searchEntertainment(query, true);
        }
    };

    const openDetailsModal = async (id, type) => {
        setShowModal(true);
        setModalLoading(true);
        setModalData(null);
        document.body.classList.add('modal-open');

        const detailsUrl = `${TMDB_API_URL}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=videos`;
        try {
            const response = await fetch(detailsUrl);
            const data = await response.json();
            setModalData(data);
            setModalLoading(false);
        } catch (error) {
            console.error("Failed to fetch details:", error);
            setShowModal(false);
        }
    };

    const closeDetailsModal = () => {
        setShowModal(false);
        document.body.classList.remove('modal-open');
    };

    if (isInitialLoading) {
        return (
            <div className="initial-loader">
                <div className="loader-content">
                    <img src="/logo.png" alt="Logo" className="loader-logo" />
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Brewing your perfect binge...</p>
                </div>
            </div>
        );
    }

    if (apiError) {
        return (
            <div className="initial-error">
                <h2>Opps!</h2>
                <p>{apiError}</p>
                <button onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    return (
        <div className="container">
            <header>
                <a href="/" className="logo-container">
                    <img src="/logo.png" alt="PickMyBinge Logo" />
                    <span className="brand-name">PickMyBinge</span>
                </a>
                <nav className={`main-nav ${isMenuOpen ? 'show' : ''}`}>
                    <button className="menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        <i className={`fas ${isMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
                    </button>
                    <div className="nav-menu">
                        <a href="/" className="active-nav"><i className="fas fa-home"></i> Home</a>
                        <a href="/cringe.html"><i className="fas fa-ghost"></i> Worst Movies</a>
                        <a href="/quiz.html"><i className="fas fa-question-circle"></i> Superhero Quiz</a>
                        <a href="/blog.html"><i className="fas fa-newspaper"></i> Blog</a>
                    </div>
                </nav>
            </header>

            <div className="hero-section">
                <h1>Find Your Next Obsession</h1>
                <p className="tagline">The ultimate tool for movie and TV show discovery.</p>
                <div className="special-features-container">
                    <div className="special-feature-link">
                        <a href="/cringe.html">😈 Dare to watch the worst? See Bad Movies!</a>
                    </div>
                    <div className="special-feature-link">
                        <a href="/quiz.html">🦸‍♂️ Which hero (or villain) are you? Take the Quiz!</a>
                    </div>
                </div>
            </div>

            <main>
                <section className="search-section">
                    <div className="search-container">
                        <div className="search-controls">
                            <div className="search-wrapper">
                                <input
                                    type="text"
                                    id="search-input"
                                    placeholder="Search for a specific title..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && triggerTextSearch()}
                                />
                            </div>
                            <select
                                id="type-filter"
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                            >
                                <option value="all">All Types</option>
                                <option value="movie">Movies Only</option>
                                <option value="tv">TV Shows Only</option>
                            </select>
                            <button id="search-btn" onClick={triggerTextSearch}>
                                <i className="fas fa-search"></i> Search
                            </button>
                        </div>
                    </div>

                    <div className="recommendation-bubbles">
                        <div
                            className={`bubble ${activeFilters.size === 0 ? 'active' : ''}`}
                            onClick={() => handleBubbleClick('popular')}
                        >🔥 Popular Now</div>
                        {Object.keys(genreMappings).map(genre => (
                            <div
                                key={genre}
                                className={`bubble ${activeFilters.has(genre) ? 'active' : ''}`}
                                onClick={() => handleBubbleClick(genre)}
                            >
                                {genre.charAt(0).toUpperCase() + genre.slice(1)}
                            </div>
                        ))}
                        <div
                            className={`bubble ${activeFilters.has('korean') ? 'active' : ''}`}
                            onClick={() => handleBubbleClick('korean')}
                        >🇰🇷 Korean</div>
                    </div>
                </section>

                <section className="results-section">
                    <h2 className="section-title">Recommended For You</h2>
                    <div className="recommendation-cards">
                        {allFetchedResults.slice(0, displayedResultsCount).map((item, index) => (
                            <button
                                key={`${item.id}-${index}`}
                                className="card"
                                onClick={() => openDetailsModal(item.id, item.type)}
                            >
                                <div className="card-header">
                                    <img src={item.poster} alt={item.title} className="poster" loading="lazy" />
                                    <span className={`type-badge ${item.type}-type`}>
                                        {item.type === 'movie' ? 'Movie' : 'TV Show'}
                                    </span>
                                </div>
                                <div className="info">
                                    <h3 className="title">{item.title}</h3>
                                    <p className="year">{item.year || 'N/A'}</p>
                                    <div className="details">
                                        <span className="rating"><i className="fas fa-star"></i> {item.rating}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    {(displayedResultsCount < allFetchedResults.length || currentPage < totalApiPages) && (
                        <button className="load-more" style={{ display: 'block' }} onClick={handleLoadMore}>Load More</button>
                    )}
                    {allFetchedResults.length === 0 && !modalLoading && (
                        <div className="no-results"><h3>No results found</h3><p>Try a different search term or filter combination.</p></div>
                    )}
                </section>

                {/* Dynamic Blog Section */}
                {blogs.length > 0 && (
                    <section className="blog-section">
                        <h2 className="section-title">Latest Blogs</h2>
                        <div className="blog-grid">
                            {blogs.map(post => (
                                <div key={post.id} className="blog-card">
                                    <span className="blog-date">{post.date}</span>
                                    <h3 className="blog-title">{post.title}</h3>
                                    <p className="blog-excerpt">{post.excerpt}</p>
                                    <a href={post.link || '#'} className="blog-read-more">Read More <i className="fas fa-arrow-right"></i></a>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="static-content-section">
                    <h2 className="section-title">Discover Recommendations for Every Mood</h2>
                    <p>Whether you're looking for a laugh-out-loud comedy, a high-octane action blockbuster, or an addictive Korean drama, PickMyBinge has you covered. Our smart engine filters thousands of titles to bring you the best, top-rated content you can watch right now. Stop scrolling and start watching!</p>
                </section>
            </main>

            <footer>
                <p>PickMyBinge &copy; 2026</p>
                <nav>
                    <a href="/privacy.html">Privacy Policy</a>
                    <a href="/terms.html">Terms &amp; Conditions</a>

                    <a href="/contact.html">Contact Us</a>
                </nav>
            </footer>

            {/* Modal */}
            {showModal && (
                <div className={`modal-overlay ${showModal ? 'show' : ''}`} onClick={closeDetailsModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <span className="modal-close" onClick={closeDetailsModal}>&times;</span>
                        {modalLoading ? (
                            <div id="modal-loader"><i className="fas fa-spinner fa-spin"></i> &nbsp; Loading...</div>
                        ) : modalData && (
                            <div id="modal-content" style={{ display: 'block' }}>
                                <div className="modal-header">
                                    {modalData.videos?.results?.find(v => v.type === 'Trailer') ? (
                                        <iframe
                                            className="modal-trailer"
                                            src={`https://www.youtube.com/embed/${modalData.videos.results.find(v => v.type === 'Trailer').key}`}
                                            allowFullScreen
                                        ></iframe>
                                    ) : (
                                        <div style={{ padding: '100px', textAlign: 'center' }}>No trailer available</div>
                                    )}
                                </div>
                                <div className="modal-body">
                                    <h2 className="modal-title">{modalData.name || modalData.title}</h2>
                                    <div className="modal-genres">
                                        {modalData.genres?.map(g => (
                                            <span key={g.id} className="genre-tag">{g.name}</span>
                                        ))}
                                    </div>
                                    <p className="modal-overview">{modalData.overview}</p>
                                    <a
                                        className="tmdb-link"
                                        href={`https://www.themoviedb.org/${modalData.title ? 'movie' : 'tv'}/${modalData.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >View full details on TMDB</a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
