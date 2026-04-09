// API configuration
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = 'your_api_key_here'; // Replace with actual API key
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// DOM elements
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-btn');
const resultsContainer = document.getElementById('results');
const savedContainer = document.getElementById('saved-results');
const resultsTitle = document.getElementById('results-title');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const instructions = document.getElementById('instructions');
const noResultsElement = document.getElementById('no-results');
const filterButtons = document.querySelectorAll('.filter-btn');
const tmdbStatus = document.getElementById('tmdb-status');
const bubbles = document.querySelectorAll('.bubble');
const toast = document.getElementById('toast');
const autocomplete = document.getElementById('autocomplete');
const loadMoreBtn = document.getElementById('load-more');
const viewResultsBtn = document.getElementById('view-results');
const viewSavedBtn = document.getElementById('view-saved');
const resultsSection = document.getElementById('results-section');
const savedSection = document.getElementById('saved-section');
const toggleFiltersBtn = document.getElementById('toggle-filters');
const advancedFilters = document.getElementById('advanced-filters');
const yearFilter = document.getElementById('year-filter');
const ratingFilter = document.getElementById('rating-filter');
const streamingFilter = document.getElementById('streaming-filter');
const genreFilter = document.getElementById('genre-filter');
const loadingSpinner = document.getElementById('loading-spinner');

// Fallback data for when API is unavailable
const FALLBACK_DATA = {
    movies: [
        {
            id: 1,
            title: "Inception",
            year: 2010,
            poster: "https://via.placeholder.com/300x450/2D3047/8B8BA0?text=Inception",
            rating: 8.8,
            plot: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
            type: "movie"
        },
        {
            id: 2,
            title: "The Shawshank Redemption",
            year: 1994,
            poster: "https://via.placeholder.com/300x450/2D3047/8B8BA0?text=Shawshank+Redemption",
            rating: 9.3,
            plot: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
            type: "movie"
        }
    ],
    tv: [
        {
            id: 4,
            title: "Stranger Things",
            year: 2016,
            poster: "https://via.placeholder.com/300x450/2D3047/8B8BA0?text=Stranger+Things",
            rating: 8.7,
            plot: "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.",
            type: "tv"
        },
        {
            id: 5,
            title: "Breaking Bad",
            year: 2008,
            poster: "https://via.placeholder.com/300x450/2D3047/8B8BA0?text=Breaking+Bad",
            rating: 9.5,
            plot: "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.",
            type: "tv"
        }
    ]
};

// Genre mappings for API calls
const genreMappings = {
    'popular': {movie: '', tv: ''},
    'comedy': {movie: '35', tv: '35'},
    'action': {movie: '28', tv: '10759'},
    'drama': {movie: '18', tv: '18'},
    'sci-fi': {movie: '878', tv: '10765'},
    'thriller': {movie: '53', tv: '80'}
};

// Application state
let currentResults = [];
let activeFilter = 'all';
let savedItems = JSON.parse(localStorage.getItem('savedBingeItems')) || [];
let currentPage = 1;
let currentQuery = '';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    displayFallbackContent();
    updateFilterButtons();
    displaySavedItems();
});

// Set up all event listeners
function initializeEventListeners() {
    // Search functionality
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Clear search input
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        showToast('Search cleared');
    });
    
    // Show/hide clear button based on input
    searchInput.addEventListener('input', function() {
        clearBtn.style.display = this.value ? 'block' : 'none';
    });
    
    // Filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            activeFilter = button.dataset.type;
            updateFilterButtons();
            
            if (currentResults.length > 0) {
                displayResults(currentResults);
                showToast(`Filtered by ${activeFilter}`);
            }
        });
    });
    
    // Recommendation bubbles
    bubbles.forEach(bubble => {
        bubble.addEventListener('click', () => {
            const searchTerm = bubble.dataset.search;
            searchInput.value = bubble.textContent;
            handleSearch(searchTerm);
        });
    });
    
    // View toggle
    viewResultsBtn.addEventListener('click', () => {
        viewResultsBtn.classList.add('active');
        viewSavedBtn.classList.remove('active');
        resultsSection.style.display = 'block';
        savedSection.classList.remove('visible');
    });
    
    viewSavedBtn.addEventListener('click', () => {
        viewSavedBtn.classList.add('active');
        viewResultsBtn.classList.remove('active');
        resultsSection.style.display = 'none';
        savedSection.classList.add('visible');
        displaySavedItems();
    });
    
    // Advanced filters toggle
    toggleFiltersBtn.addEventListener('click', () => {
        advancedFilters.classList.toggle('visible');
        if (advancedFilters.classList.contains('visible')) {
            toggleFiltersBtn.innerHTML = '<i class="fas fa-times"></i> Close Filters';
        } else {
            toggleFiltersBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Advanced Filters';
        }
    });
}

// Handle search functionality
function handleSearch(query) {
    const searchQuery = query || searchInput.value.trim().toLowerCase();
    if (searchQuery.length > 0) {
        searchEntertainment(searchQuery);
    } else {
        showToast('Please enter a search term', 'error');
        searchInput.focus();
    }
}

// Main search function
async function searchEntertainment(query, page = 1) {
    loadingElement.style.display = 'block';
    loadingSpinner.style.display = 'block';
    errorElement.style.display = 'none';
    noResultsElement.style.display = 'none';
    
    if (page === 1) {
        resultsContainer.innerHTML = '';
    }
    
    try {
        if (page === 1) {
            currentResults = [];
        }
        
        resultsTitle.textContent = `Results for "${query}"`;
        currentQuery = query;
        currentPage = page;
        
        // Try to use API, fallback to local data if unavailable
        try {
            // This would be the actual API implementation
            // For demo purposes, we'll use the fallback data
            throw new Error('API not configured in demo');
        } catch (error) {
            // Use fallback data
            useFallbackData(query);
        }
        
        if (currentResults.length > 0) {
            displayResults(currentResults);
        } else {
            noResultsElement.style.display = 'block';
            resultsTitle.textContent = 'No Results Found';
            showToast('No results found for your search', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        errorElement.style.display = 'block';
        showToast('An error occurred during search', 'error');
    } finally {
        loadingElement.style.display = 'none';
        loadingSpinner.style.display = 'none';
        instructions.style.display = 'none';
    }
}

// Use fallback data when API is unavailable
function useFallbackData(query) {
    currentResults = [];
    
    // Add movies
    FALLBACK_DATA.movies.forEach(movie => {
        currentResults.push({
            type: 'movie',
            data: movie
        });
    });
    
    // Add TV shows
    FALLBACK_DATA.tv.forEach(tv => {
        currentResults.push({
            type: 'tv',
            data: tv
        });
    });
}

// Display results in the UI
function displayResults(results) {
    const filteredResults = results.filter(item => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'movie') return item.data.type === 'movie';
        if (activeFilter === 'tv') return item.data.type === 'tv';
        if (activeFilter === 'high-rated') return item.data.rating >= 8.0;
        return true;
    });
    
    if (filteredResults.length === 0) {
        noResultsElement.style.display = 'block';
        resultsTitle.textContent = 'No Matching Results';
        return;
    }
    
    resultsContainer.innerHTML = '';
    
    filteredResults.forEach((item, index) => {
        const card = createCardElement(item.data, index);
        resultsContainer.appendChild(card);
    });
}

// Create a card element for display
function createCardElement(data, index) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.style.animationDelay = `${index * 0.1}s`;
    card.setAttribute('role', 'listitem');
    
    const title = data.title || 'Unknown Title';
    const year = data.year || 'N/A';
    const image = data.poster || 'https://via.placeholder.com/300x450/2D3047/8B8BA0?text=No+Image';
    const plot = data.plot || 'No description available';
    const rating = data.rating !== 'N/A' ? data.rating : 'N/A';
    const type = data.type || 'tv';
    const bingeScore = data.bingeScore || Math.floor(Math.random() * 20) + 75;
    
    // Check if item is saved
    const isSaved = savedItems.some(savedItem => savedItem.id === data.id);
    
    // Shorten plot if too long
    const shortenedPlot = plot.length > 120 ? plot.substring(0, 120) + '...' : plot;
    
    card.innerHTML = `
        <div class="card-header">
            <button class="save-btn ${isSaved ? 'saved' : ''}" data-id="${data.id}" data-type="${type}" aria-label="${isSaved ? 'Remove from saved' : 'Save for later'}">
                <i class="fas ${isSaved ? 'fa-bookmark' : 'fa-bookmark-o'}"></i>
            </button>
            <img src="${image}" alt="${title}" class="poster">
            <span class="type-badge ${type === 'movie' ? 'movie-type' : 'tv-type'}">${type === 'movie' ? 'Movie' : 'TV Show'}</span>
        </div>
        <div class="info">
            <h2 class="title">${title}</h2>
            <p class="year">${year}</p>
            <p class="plot">${shortenedPlot}</p>
            <div class="binge-meter">
                <div class="binge-meter-fill" style="width: ${bingeScore}%"></div>
            </div>
            <div class="details">
                <span>Binge Score: ${bingeScore}%</span>
                <span class="rating"><i class="fas fa-star"></i> ${rating}</span>
            </div>
        </div>
    `;
    
    // Add event listener to save button
    const saveBtn = card.querySelector('.save-btn');
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSaveItem(data);
    });
    
    return card;
}

// Toggle save item
function toggleSaveItem(item) {
    const index = savedItems.findIndex(savedItem => savedItem.id === item.id);
    
    if (index === -1) {
        // Item not saved, add it
        savedItems.push(item);
        showToast(`"${item.title}" saved for later`);
    } else {
        // Item already saved, remove it
        savedItems.splice(index, 1);
        showToast(`"${item.title}" removed from saved`);
    }
    
    // Update localStorage
    localStorage.setItem('savedBingeItems', JSON.stringify(savedItems));
    
    // Update UI
    updateSaveButtons();
    displaySavedItems();
}

// Display saved items
function displaySavedItems() {
    savedContainer.innerHTML = '';
    
    if (savedItems.length === 0) {
        savedContainer.innerHTML = `
            <div class="no-results" style="display: block;">
                <i class="fas fa-bookmark" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;"></i>
                <h3>No saved items yet</h3>
                <p>Save shows and movies to watch them later</p>
            </div>
        `;
        return;
    }
    
    savedItems.forEach((item, index) => {
        const card = createCardElement(item, index);
        savedContainer.appendChild(card);
    });
}

// Update save buttons state
function updateSaveButtons() {
    document.querySelectorAll('.save-btn').forEach(btn => {
        const id = btn.dataset.id;
        const isSaved = savedItems.some(item => item.id === id);
        
        if (isSaved) {
            btn.classList.add('saved');
            btn.innerHTML = '<i class="fas fa-bookmark"></i>';
            btn.setAttribute('aria-label', 'Remove from saved');
        } else {
            btn.classList.remove('saved');
            btn.innerHTML = '<i class="fas fa-bookmark-o"></i>';
            btn.setAttribute('aria-label', 'Save for later');
        }
    });
}

// Update filter button accessibility attributes
function updateFilterButtons() {
    filterButtons.forEach(button => {
        if (button.dataset.type === activeFilter) {
            button.setAttribute('aria-pressed', 'true');
        } else {
            button.setAttribute('aria-pressed', 'false');
        }
    });
}

// Display fallback content initially
function displayFallbackContent() {
    // This would show skeleton loading screens
    // In our case, we have demo content already in the HTML
}

// Toast notification function
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 3000);
}
