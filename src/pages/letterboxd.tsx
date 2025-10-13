import React, { useState, useEffect } from "react";

interface Movie {
  id: number;
  title: string;
  year: number;
  director: string;
  releaseDate: string;
  posterPath: string;
}

interface WatchedMovie extends Movie {
  watchedDate: string;
  rating: number;
  rewatch: boolean;
  review: string;
}

interface WatchlistMovie extends Movie {
  addedDate: string;
}

type TimeFrame = "last-year" | "two-years" | "few-years" | "release";

interface TMDBCredits {
  crew: {
    job: string;
    name: string;
  }[];
}

// TMDB API Key - you'll need to get one from https://www.themoviedb.org/settings/api
const TMDB_API_KEY = "5101c5af4d0e8c519d1d4f01b04377bb"; // Replace with actual API key
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const fetchPopularMovies = async (): Promise<Movie[]> => {
  const movies: Movie[] = [];

  try {
    // Fetch multiple pages of top rated movies
    for (let page = 1; page <= 25; page++) {
      // Get 500 movies (20 per page)
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&page=${page}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch movies: ${response.statusText}`);
      }

      const data = await response.json();

      for (const movie of data.results) {
        // Skip movies without release dates
        if (!movie.release_date) {
          continue;
        }

        // Fetch credits to get director
        const creditsResponse = await fetch(
          `${TMDB_BASE_URL}/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}`
        );

        let director = "Unknown Director";
        if (creditsResponse.ok) {
          const creditsData: TMDBCredits = await creditsResponse.json();
          const directorCredit = creditsData.crew.find(
            (person) => person.job === "Director"
          );
          if (directorCredit) {
            director = directorCredit.name;
          }
        }

        const releaseYear = parseInt(movie.release_date.substring(0, 4));

        movies.push({
          id: movie.id,
          title: movie.title,
          year: releaseYear,
          director,
          releaseDate: movie.release_date,
          posterPath: movie.poster_path || "",
        });
      }
    }
  } catch (error) {
    console.error("Error fetching movies:", error);
  }

  return movies;
};

const parseLetterboxdCSV = (csvContent: string): Set<string> => {
  const lines = csvContent.split("\n");
  const watchedTitles = new Set<string>();

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle quoted values)
    const matches = line.match(/("([^"]*(?:""[^"]*)*)"|[^",]*)(,|$)/g);
    if (matches && matches.length > 0) {
      let title = matches[0].replace(/,$/, ""); // Remove trailing comma
      // Remove quotes and handle escaped quotes
      if (title.startsWith('"') && title.endsWith('"')) {
        title = title.slice(1, -1).replace(/""/g, '"');
      }
      if (title) {
        watchedTitles.add(title.toLowerCase());
      }
    }
  }

  return watchedTitles;
};

const generateRandomDate = (
  timeFrame: TimeFrame,
  releaseDate: string
): string => {
  const release = new Date(releaseDate);
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (timeFrame) {
    case "last-year":
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = now;
      break;
    case "two-years":
      startDate = new Date(now.getFullYear() - 2, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31);
      break;
    case "few-years":
      startDate = new Date(now.getFullYear() - 5, 0, 1);
      endDate = new Date(now.getFullYear() - 2, 11, 31);
      break;
    case "release":
      startDate = release;
      endDate = new Date(release.getFullYear() + 2, 11, 31);
      break;
  }

  // Ensure the start date is not before the release date
  if (startDate < release) {
    startDate = release;
  }

  // Ensure the end date is not in the future
  if (endDate > now) {
    endDate = now;
  }
  const randomTime =
    startDate.getTime() +
    Math.random() * (endDate.getTime() - startDate.getTime());
  return new Date(randomTime).toISOString().split("T")[0];
};

const StarRating: React.FC<{
  rating: number;
  onChange: (rating: number) => void;
}> = ({ rating, onChange }) => {
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i;
    const halfFilled = rating >= i - 0.5 && rating < i;

    stars.push(
      <button
        key={i}
        className="text-2xl focus:outline-none hover:scale-110 transition-transform"
        onClick={() => onChange(halfFilled ? i : i - 0.5)}
      >
        {filled ? "●" : halfFilled ? "◐" : "○"}
      </button>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      {stars}
      <span className="ml-2 text-sm text-gray-600">
        {rating > 0 ? rating : "No rating"}
      </span>
    </div>
  );
};

const MovieCard: React.FC<{
  movie: Movie;
  onIgnore: () => void;
  onWatch: (
    data: Omit<
      WatchedMovie,
      "id" | "title" | "year" | "director" | "releaseDate" | "posterPath"
    >
  ) => void;
  onAddToWatchlist: () => void;
}> = ({ movie, onIgnore, onWatch, onAddToWatchlist }) => {
  const [rating, setRating] = useState(0);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("last-year");
  const [rewatch, setRewatch] = useState(false);
  const [review, setReview] = useState("");
  const [generatedDate, setGeneratedDate] = useState("");

  // Generate initial date when component mounts or timeFrame changes
  useEffect(() => {
    setGeneratedDate(generateRandomDate(timeFrame, movie.releaseDate));
  }, [timeFrame, movie.releaseDate]);

  const refreshDate = () => {
    setGeneratedDate(generateRandomDate(timeFrame, movie.releaseDate));
  };

  const handleWatch = () => {
    onWatch({
      watchedDate: generatedDate,
      rating,
      rewatch,
      review,
    });
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex gap-4">
        {/* Movie Poster */}
        <div className="flex-shrink-0">
          {movie.posterPath ? (
            <img
              src={`https://image.tmdb.org/t/p/w200${movie.posterPath}`}
              alt={`${movie.title} poster`}
              className="w-24 h-36 object-cover rounded"
              onError={(e) => {
                e.currentTarget.src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='144' viewBox='0 0 96 144'%3E%3Crect width='96' height='144' fill='%23f3f4f6'/%3E%3Ctext x='48' y='72' text-anchor='middle' fill='%236b7280' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
              }}
            />
          ) : (
            <div className="w-24 h-36 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs text-center">
                No Image
              </span>
            </div>
          )}
        </div>

        {/* Movie Info and Form */}
        <div className="flex-1">
          <h3 className="font-bold text-lg">{movie.title}</h3>
          <p className="text-gray-600 mb-4">
            {movie.year} • {movie.director}
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Rating</label>
              <StarRating rating={rating} onChange={setRating} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                When did you watch it?
              </label>
              <div className="flex gap-2 items-center">
                <select
                  value={timeFrame}
                  onChange={(e) => setTimeFrame(e.target.value as TimeFrame)}
                  className="flex-1 p-2 border rounded"
                >
                  <option value="last-year">Last year</option>
                  <option value="two-years">Two years ago</option>
                  <option value="few-years">Few years ago</option>
                  <option value="release">Around release date</option>
                </select>
                <button
                  onClick={refreshDate}
                  className="px-2 py-2 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                  title="Generate new random date"
                >
                  🔄
                </button>
              </div>
              {generatedDate && (
                <p className="text-sm text-gray-600 mt-1">
                  Generated date: {new Date(generatedDate).toLocaleDateString()}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rewatch}
                  onChange={(e) => setRewatch(e.target.checked)}
                />
                <span className="text-sm">This was a rewatch</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Review (optional)
              </label>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                className="w-full p-2 border rounded resize-none"
                rows={2}
                placeholder="Your thoughts about the movie..."
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={onIgnore}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={onAddToWatchlist}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Add to Watchlist
              </button>
              <button
                onClick={handleWatch}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                Mark as Watched
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function LetterBoxd() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [watchedMovies, setWatchedMovies] = useState<WatchedMovie[]>([]);
  const [watchlistMovies, setWatchlistMovies] = useState<WatchlistMovie[]>([]);
  const [ignoredMovies, setIgnoredMovies] = useState<Set<number>>(new Set());
  const [importedWatchedTitles, setImportedWatchedTitles] = useState<
    Set<string>
  >(new Set());
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const allWatchedTitles = new Set<string>(importedWatchedTitles);
    let processedFiles = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvContent = e.target?.result as string;
        const watchedTitles = parseLetterboxdCSV(csvContent);

        // Merge with existing watched titles
        watchedTitles.forEach((title) => allWatchedTitles.add(title));

        processedFiles++;

        // Update state after all files are processed
        if (processedFiles === files.length) {
          setImportedWatchedTitles(allWatchedTitles);

          // Auto-skip to first unwatched movie
          if (movies.length > 0) {
            const firstUnwatchedIndex = movies.findIndex(
              (movie) => !allWatchedTitles.has(movie.title.toLowerCase())
            );
            if (firstUnwatchedIndex !== -1) {
              setCurrentIndex(firstUnwatchedIndex);
            }
          }
        }
      };
      reader.readAsText(file);
    });
  };

  // Check if current movie is already watched
  const isCurrentMovieWatched =
    movies[currentIndex] &&
    importedWatchedTitles.has(movies[currentIndex].title.toLowerCase());

  // Auto-skip watched movies
  useEffect(() => {
    if (isCurrentMovieWatched && currentIndex < movies.length - 1) {
      const timer = setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 100); // Small delay to prevent infinite loops
      return () => clearTimeout(timer);
    }
  }, [currentIndex, isCurrentMovieWatched, movies.length]);

  useEffect(() => {
    const loadMovies = async () => {
      try {
        setLoading(true);
        const fetchedMovies = await fetchPopularMovies();
        setMovies(fetchedMovies);
        setError(null);
      } catch (err) {
        setError("Failed to load movies. Please try again later.");
        console.error("Error loading movies:", err);
      } finally {
        setLoading(false);
      }
    };

    loadMovies();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading popular movies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No movies available.</p>
        </div>
      </div>
    );
  }

  const currentMovie = movies[currentIndex];
  const progress =
    ((currentIndex +
      ignoredMovies.size +
      watchedMovies.length +
      watchlistMovies.length) /
      movies.length) *
    100;

  const handleIgnore = () => {
    setIgnoredMovies((prev) => new Set(prev).add(currentMovie.id));
    setCurrentIndex((prev) => prev + 1);
  };

  const handleWatch = (
    watchData: Omit<
      WatchedMovie,
      "id" | "title" | "year" | "director" | "releaseDate" | "posterPath"
    >
  ) => {
    const watchedMovie: WatchedMovie = {
      ...currentMovie,
      ...watchData,
    };
    setWatchedMovies((prev) => [...prev, watchedMovie]);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleAddToWatchlist = () => {
    const watchlistMovie: WatchlistMovie = {
      ...currentMovie,
      addedDate: new Date().toISOString().split("T")[0],
    };
    setWatchlistMovies((prev) => [...prev, watchlistMovie]);
    setCurrentIndex((prev) => prev + 1);
  };

  const generateWatchedCSV = () => {
    const headers = [
      "Title",
      "Year",
      "Directors",
      "WatchedDate",
      "Rating",
      "Rewatch",
      "Review",
    ];
    const rows = watchedMovies.map((movie) => [
      movie.title,
      movie.year.toString(),
      movie.director,
      movie.watchedDate,
      movie.rating > 0 ? movie.rating.toString() : "",
      movie.rewatch ? "Yes" : "No",
      movie.review,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((field) => `"${field.replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "letterboxd-watched.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateWatchlistCSV = () => {
    const headers = [
      "Title",
      "Year",
      "Directors",
      "WatchedDate",
      "Rating",
      "Rewatch",
      "Review",
    ];
    const rows = watchlistMovies.map((movie) => [
      movie.title,
      movie.year.toString(),
      movie.director,
      "", // Empty WatchedDate for watchlist
      "", // Empty Rating for watchlist
      "No", // Default Rewatch to No for watchlist
      "", // Empty Review for watchlist
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((field) => `"${field.replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "letterboxd-watchlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (currentIndex >= movies.length) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8">All Done! 🎬</h1>
          <div className="text-center space-y-4">
            <p className="text-lg">
              You've marked <strong>{watchedMovies.length}</strong> new movies
              as watched and <strong>{watchlistMovies.length}</strong> movies
              for your watchlist!
              {importedWatchedTitles.size > 0 && (
                <span className="block text-sm text-gray-600 mt-2">
                  ({importedWatchedTitles.size} previously watched movies were
                  automatically skipped)
                </span>
              )}
            </p>

            <div className="flex gap-4 justify-center">
              {watchedMovies.length > 0 && (
                <button
                  onClick={generateWatchedCSV}
                  className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  Download Watched Movies CSV
                </button>
              )}
              {watchlistMovies.length > 0 && (
                <button
                  onClick={generateWatchlistCSV}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  Download Watchlist CSV
                </button>
              )}
            </div>

            <div className="mt-8 grid md:grid-cols-2 gap-8">
              {watchedMovies.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold mb-4">
                    Your Watched Movies:
                  </h2>
                  <div className="space-y-2 text-left max-h-96 overflow-y-auto">
                    {watchedMovies.map((movie) => (
                      <div
                        key={movie.id}
                        className="bg-white p-3 rounded border"
                      >
                        <span className="font-medium">{movie.title}</span> (
                        {movie.year})
                        {movie.rating > 0 && (
                          <span className="ml-2">
                            {"★".repeat(Math.floor(movie.rating))}
                            {movie.rating % 1 === 0.5 && "⭐"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {watchlistMovies.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold mb-4">Your Watchlist:</h2>
                  <div className="space-y-2 text-left max-h-96 overflow-y-auto">
                    {watchlistMovies.map((movie) => (
                      <div
                        key={movie.id}
                        className="bg-white p-3 rounded border"
                      >
                        <span className="font-medium">{movie.title}</span> (
                        {movie.year})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Letterboxd CSV Builder</h1>

          {/* Import CSV Section */}
          <div className="mb-6 p-4 bg-white rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">
              Import Existing Letterboxd CSVs
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              Upload your existing Letterboxd exports to skip movies you've
              already watched. You can select multiple CSV files at once.
            </p>
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileImport}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {importedWatchedTitles.size > 0 && (
              <p className="mt-2 text-sm text-green-600">
                ✓ Imported {importedWatchedTitles.size} watched movies from
                uploaded CSV(s) - these will be automatically skipped
              </p>
            )}
          </div>

          <div className="bg-white rounded-full h-2 mb-4">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-600">
            Movie {currentIndex + 1} of {movies.length} • Watched:{" "}
            {watchedMovies.length} • Watchlist: {watchlistMovies.length} •
            Skipped: {ignoredMovies.size}
            {importedWatchedTitles.size > 0 && (
              <span> • Previously watched: {importedWatchedTitles.size}</span>
            )}
          </p>
        </div>

        {isCurrentMovieWatched ? (
          <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200 text-center">
            <p className="text-yellow-800">
              Skipping "{currentMovie?.title}" - already in your watched list
            </p>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600 mx-auto mt-2"></div>
          </div>
        ) : (
          <MovieCard
            movie={currentMovie}
            onIgnore={handleIgnore}
            onWatch={handleWatch}
            onAddToWatchlist={handleAddToWatchlist}
          />
        )}

        {(watchedMovies.length > 0 || watchlistMovies.length > 0) && (
          <div className="mt-8 text-center space-x-4">
            {watchedMovies.length > 0 && (
              <button
                onClick={generateWatchedCSV}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                Download Watched CSV ({watchedMovies.length})
              </button>
            )}
            {watchlistMovies.length > 0 && (
              <button
                onClick={generateWatchlistCSV}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Download Watchlist CSV ({watchlistMovies.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
