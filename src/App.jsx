import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const RESULTS_PER_LOAD = 8;
const CURRENT_YEAR = new Date().getFullYear();

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
    const [toast, setToast] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const didInit = useRef(false);
    const filtersFirstRun = useRef(true);

    const showToast = useCallback((msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    const loadBlogs = useCallback(async () => {
        try {
            const res = await fetch('/blogs-index.json');
            if (!res.ok) throw new Error("Blog index not found");
            const loadedBlogs = await res.json();

            // Sort by date descending
            loadedBlogs.sort((a, b) => new Date(b.date) - new Date(a.date));
            setBlogs(loadedBlogs);
        } catch (err) {
            console.error("Failed to load blogs:", err);
            setBlogs([]);
            showToast("Couldn't load blogs.");
        }
    }, []);

    const shuffleArray = useCallback((array) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }, []);

    const fetchData = useCallback(async (type, query, page, isText) => {
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
            if (!response.ok) return { results: [], total_results: 0 };
            const data = await response.json();
            setTotalApiPages(data.total_pages);
            const results = data.results.map(item => ({
                id: item.id,
                type: type,
                title: type === 'movie' ? item.title : item.name,
                year: ((type === 'movie' ? item.release_date : item.first_air_date) || '').substring(0, 4),
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/300x450/2D3047/8B8BA0?text=No+Image',
                rating: (item.vote_average || 0).toFixed(1)
            }));
            return { results, total_results: data.total_results };
        } catch (error) {
            console.error('Failed to fetch data:', error);
            return { results: [], total_results: 0 };
        }
    }, [activeFilters]);

    const searchEntertainment = useCallback(async (query, isNewSearch = true, targetPage = 1) => {
        const isText = !!query;

        if (isNewSearch) {
            setIsSearching(true);
            setCurrentPage(1);
            setAllFetchedResults([]);
            setDisplayedResultsCount(0);
        } else {
            setIsLoadingMore(true);
            setCurrentPage(targetPage);
        }

        let movieData = { results: [], total_results: 0 };
        let tvData = { results: [], total_results: 0 };

        if (typeFilter === 'all') {
            [movieData, tvData] = await Promise.all([
                fetchData('movie', query, targetPage, isText),
                fetchData('tv', query, targetPage, isText)
            ]);
        } else if (typeFilter === 'movie') {
            movieData = await fetchData('movie', query, targetPage, isText);
        } else if (typeFilter === 'tv') {
            tvData = await fetchData('tv', query, targetPage, isText);
        }

        try {
            const combined = shuffleArray([...movieData.results, ...tvData.results]);

            if (isNewSearch) {
                const seen = new Set();
                const newResults = combined.filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });
                setAllFetchedResults(newResults);
                setDisplayedResultsCount(Math.min(newResults.length, RESULTS_PER_LOAD));
            } else {
                setAllFetchedResults(prev => {
                    const seen = new Set(prev.map(r => r.id));
                    const uniqueNew = combined.filter(item => {
                        if (seen.has(item.id)) return false;
                        seen.add(item.id);
                        return true;
                    });
                    setDisplayedResultsCount(count => count + Math.min(uniqueNew.length, RESULTS_PER_LOAD));
                    return [...prev, ...uniqueNew];
                });
            }
        } finally {
            setIsSearching(false);
            setIsLoadingMore(false);
        }
    }, [fetchData, shuffleArray, typeFilter]);

    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        const init = async () => {
            try {
                await Promise.all([
                    searchEntertainment(null, true),
                    loadBlogs()
                ]);
            } catch (err) {
                console.error("Initialization failed:", err);
                setApiError("Failed to load initial data. Please check your connection.");
            } finally {
                setIsInitialLoading(false);
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLoadMore = () => {
        if (displayedResultsCount < allFetchedResults.length) {
            setDisplayedResultsCount(prev => Math.min(prev + RESULTS_PER_LOAD, allFetchedResults.length));
        } else if (currentPage < totalApiPages) {
            const nextPage = currentPage + 1;
            searchEntertainment(isTextSearch ? currentQuery : null, false, nextPage);
        } else {
            showToast("You've reached the end!");
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
                    showToast('You can select up to 2 filters at a time.');
                    return;
                }
                newFilters.add(filter);
            }
        }
        setActiveFilters(newFilters);
        // Reset pagination state when filters change
        setCurrentPage(1);
        setTotalApiPages(1);
    };

    // Trigger search when filters change (skip the very first mount run)
    useEffect(() => {
        if (filtersFirstRun.current) {
            filtersFirstRun.current = false;
            return;
        }
        if (!isTextSearch) {
            searchEntertainment(null, true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            // Preserve the type we were passed so links don't mis-detect TV as movie
            setModalData({ ...data, __type: type });
        } catch (error) {
            console.error("Failed to fetch details:", error);
            showToast("Couldn't load details. Please try again.");
            setShowModal(false);
            document.body.classList.remove('modal-open');
        } finally {
            setModalLoading(false);
        }
    };

    const closeDetailsModal = useCallback(() => {
        setShowModal(false);
        document.body.classList.remove('modal-open');
    }, []);

    // Close modal on Escape
    useEffect(() => {
        if (!showModal) return;
        const onKey = (e) => { if (e.key === 'Escape') closeDetailsModal(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showModal, closeDetailsModal]);

    // Close mobile menu on Escape
    useEffect(() => {
        if (!isMenuOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') setIsMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isMenuOpen]);

    // Scroll-to-top visibility
    useEffect(() => {
        const onScroll = () => setShowScrollTop(window.scrollY > 600);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    const clearSearchInput = () => setSearchInput('');

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
            <div className="initial-error" role="alert">
                <h2>Oops!</h2>
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
                <nav className="main-nav" aria-label="Primary">
                    <button
                        className="menu-btn"
                        onClick={() => setIsMenuOpen(true)}
                        aria-label="Open menu"
                        aria-expanded={isMenuOpen}
                        aria-controls="main-nav-menu"
                    >
                        <i className="fas fa-bars" aria-hidden="true"></i>
                    </button>
                    {isMenuOpen && (
                        <div
                            className="nav-backdrop"
                            onClick={() => setIsMenuOpen(false)}
                            aria-hidden="true"
                        />
                    )}
                    <div
                        id="main-nav-menu"
                        className={`nav-menu ${isMenuOpen ? 'show' : ''}`}
                        role="menu"
                    >
                        <button
                            className="close-btn"
                            onClick={() => setIsMenuOpen(false)}
                            aria-label="Close menu"
                        >
                            <i className="fas fa-times" aria-hidden="true"></i>
                        </button>
                        <a href="/" className="active-nav" role="menuitem"><i className="fas fa-home" aria-hidden="true"></i> Home</a>
                        <a href="/cringe.html" role="menuitem"><i className="fas fa-ghost" aria-hidden="true"></i> Cringe Movies</a>
                        <a href="/quiz.html" role="menuitem"><i className="fas fa-question-circle" aria-hidden="true"></i> Superhero Quiz</a>
                        <a href="/blog.html" role="menuitem"><i className="fas fa-newspaper" aria-hidden="true"></i> Blog</a>
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
                                <label htmlFor="search-input" className="visually-hidden">Search titles</label>
                                <input
                                    type="search"
                                    id="search-input"
                                    placeholder="Search for a specific title..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && triggerTextSearch()}
                                    autoComplete="off"
                                />
                                {searchInput && (
                                    <button
                                        type="button"
                                        className="search-clear"
                                        onClick={clearSearchInput}
                                        aria-label="Clear search"
                                    >
                                        <i className="fas fa-times-circle" aria-hidden="true"></i>
                                    </button>
                                )}
                            </div>
                            <label htmlFor="type-filter" className="visually-hidden">Content type</label>
                            <select
                                id="type-filter"
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                            >
                                <option value="all">All Types</option>
                                <option value="movie">Movies Only</option>
                                <option value="tv">TV Shows Only</option>
                            </select>
                            <button id="search-btn" onClick={triggerTextSearch} aria-label="Search">
                                <i className="fas fa-search" aria-hidden="true"></i> Search
                            </button>
                        </div>
                    </div>

                    <div className="recommendation-bubbles" role="group" aria-label="Genre filters">
                        <button
                            type="button"
                            className={`bubble ${activeFilters.size === 0 ? 'active' : ''}`}
                            onClick={() => handleBubbleClick('popular')}
                            aria-pressed={activeFilters.size === 0}
                        >🔥 Popular Now</button>
                        {Object.keys(genreMappings).map(genre => (
                            <button
                                type="button"
                                key={genre}
                                className={`bubble ${activeFilters.has(genre) ? 'active' : ''}`}
                                onClick={() => handleBubbleClick(genre)}
                                aria-pressed={activeFilters.has(genre)}
                            >
                                {genre.charAt(0).toUpperCase() + genre.slice(1)}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`bubble ${activeFilters.has('korean') ? 'active' : ''}`}
                            onClick={() => handleBubbleClick('korean')}
                            aria-pressed={activeFilters.has('korean')}
                        >🇰🇷 Korean</button>
                    </div>
                </section>

                <div className="results-count">
                    {allFetchedResults.length > 0 && (
                        <p>Showing {Math.min(displayedResultsCount, allFetchedResults.length)} of {allFetchedResults.length} recommendations</p>
                    )}
                </div>

                <section className="results-section">
                    <h2 className="section-title">Recommended For You</h2>
                    <div className="recommendation-cards" aria-live="polite" aria-busy={isSearching}>
                        {isSearching && allFetchedResults.length === 0 ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={`skeleton-${i}`} className="card skeleton-card" aria-hidden="true">
                                    <div className="skeleton-poster"></div>
                                    <div className="info">
                                        <div className="skeleton-line skeleton-title"></div>
                                        <div className="skeleton-line skeleton-sub"></div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            allFetchedResults.slice(0, displayedResultsCount).map((item, index) => (
                                <button
                                    key={`${item.id}-${index}`}
                                    className="card"
                                    onClick={() => openDetailsModal(item.id, item.type)}
                                    aria-label={`View details for ${item.title}`}
                                >
                                    <div className="card-header">
                                        <img
                                            src={item.poster}
                                            alt={item.title ? `Poster for ${item.title}` : 'Poster'}
                                            className="poster"
                                            loading="lazy"
                                            width="300"
                                            height="450"
                                        />
                                        <span className={`type-badge ${item.type}-type`}>
                                            {item.type === 'movie' ? 'Movie' : 'TV Show'}
                                        </span>
                                    </div>
                                    <div className="info">
                                        <h3 className="title">{item.title}</h3>
                                        <p className="year">{item.year || 'N/A'}</p>
                                        <div className="details">
                                            <span className="rating" aria-label={`Rating ${item.rating} out of 10`}>
                                                <i className="fas fa-star" aria-hidden="true"></i> {item.rating}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    {!isSearching && (displayedResultsCount < allFetchedResults.length || currentPage < totalApiPages) && (
                        <button
                            className="load-more"
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                            aria-busy={isLoadingMore}
                        >
                            {isLoadingMore ? (
                                <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Loading...</>
                            ) : (
                                'Load More'
                            )}
                        </button>
                    )}
                    {!isSearching && allFetchedResults.length === 0 && (
                        <div className="no-results" role="status">
                            <i className="fas fa-search" aria-hidden="true"></i>
                            <h3>No results found</h3>
                            <p>Try a different search term or filter combination.</p>
                        </div>
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
                <p>PickMyBinge &copy; {CURRENT_YEAR}</p>
                <nav aria-label="Footer">
                    <a href="/privacy.html">Privacy Policy</a>
                    <a href="/terms.html">Terms &amp; Conditions</a>
                    <a href="/contact.html">Contact Us</a>
                </nav>
            </footer>

            {/* Toast */}
            {toast && (
                <div className="toast" role="status" aria-live="polite">{toast}</div>
            )}

            {/* Scroll to top */}
            {showScrollTop && (
                <button
                    type="button"
                    className="scroll-top"
                    onClick={scrollToTop}
                    aria-label="Scroll to top"
                >
                    <i className="fas fa-arrow-up" aria-hidden="true"></i>
                </button>
            )}

            {/* Modal */}
            {showModal && (
                <div
                    className={`modal-overlay ${showModal ? 'show' : ''}`}
                    onClick={closeDetailsModal}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Content details"
                >
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={closeDetailsModal}
                            aria-label="Close details"
                        >&times;</button>
                        {modalLoading ? (
                            <div id="modal-loader"><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> &nbsp; Loading...</div>
                        ) : modalData && (
                            <div className="modal-content">
                                <div className="modal-header">
                                    {modalData.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ? (
                                        <iframe
                                            className="modal-trailer"
                                            title={`${modalData.name || modalData.title || 'Content'} trailer`}
                                            src={`https://www.youtube.com/embed/${modalData.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube').key}`}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        ></iframe>
                                    ) : (
                                        <div className="no-trailer" style={{ padding: '60px 20px', textAlign: 'center' }}>
                                            <i className="fas fa-film" aria-hidden="true" style={{ fontSize: '2rem', opacity: 0.5 }}></i>
                                            <p style={{ marginTop: '12px' }}>No trailer available</p>
                                        </div>
                                    )}
                                </div>
                                <div className="modal-body">
                                    <h2 className="modal-title">{modalData.name || modalData.title}</h2>
                                    <div className="modal-genres">
                                        {modalData.genres?.slice(0, 4).map(g => (
                                            <span key={g.id} className="genre-tag">{g.name}</span>
                                        ))}
                                    </div>
                                    <p className="modal-overview">{modalData.overview || 'No summary available.'}</p>
                                    <a
                                        className="tmdb-link"
                                        href={`https://www.themoviedb.org/${modalData.__type || (modalData.title ? 'movie' : 'tv')}/${modalData.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >View full details on TMDB <i className="fas fa-external-link-alt" aria-hidden="true"></i></a>
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
