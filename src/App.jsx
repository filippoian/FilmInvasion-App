import { useState, useEffect } from 'react';
import { Play, Tv, X, Heart, Search, ChevronLeft, Info } from 'lucide-react';
import TinderCard from 'react-tinder-card';
import Hls from 'hls.js';
import './index.css';

const TMDB_API_KEY = '4f326db571b33214a0c87fc56df4ed22';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const GENRES = [
  { id: 28, name: 'Azione' },
  { id: 35, name: 'Commedia' },
  { id: 53, name: 'Thriller' },
  { id: 12, name: 'Avventura' },
  { id: 878, name: 'Fantascienza' },
  { id: 16, name: 'Animazione' }
];

function App() {
  const [screen, setScreen] = useState('home'); // home, swipe, verify, player
  const [movies, setMovies] = useState([]);
  const [currentMovie, setCurrentMovie] = useState(null);
  const [streamingOptions, setStreamingOptions] = useState(null);
  
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [playingUrl, setPlayingUrl] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPlotMovie, setExpandedPlotMovie] = useState(null);

  const [discarded, setDiscarded] = useState([]);
  
  useEffect(() => {
    const savedDiscarded = JSON.parse(localStorage.getItem('discarded_movies') || '[]');
    setDiscarded(savedDiscarded);

    window.__onGCastApiAvailable = function (isAvailable) {
      if (isAvailable) {
        setIsCastAvailable(true);
        // eslint-disable-next-line no-undef
        cast.framework.CastContext.getInstance().setOptions({
          // eslint-disable-next-line no-undef
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          // eslint-disable-next-line no-undef
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });
      }
    };
  }, []);

  const saveDiscarded = (id) => {
    const updated = [...discarded, id];
    setDiscarded(updated);
    localStorage.setItem('discarded_movies', JSON.stringify(updated));
  };

  const fetchMovies = async (genreId, pageNum = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc&with_genres=${genreId}&page=${pageNum}`);
      const data = await res.json();
      
      if (!data.results) {
        alert("Errore caricamento. Riprova.");
        setLoading(false);
        return;
      }
      
      const filtered = data.results.filter(m => !discarded.includes(m.id) && m.poster_path);
      
      if (filtered.length === 0) {
        setPage(pageNum + 1);
        fetchMovies(genreId, pageNum + 1);
      } else {
        setMovies(filtered.reverse()); 
        setScreen('swipe');
      }
    } catch(e) {
      alert("Errore di connessione.");
    }
    setLoading(false);
  };

  const handleGenreClick = (genreId) => {
    setSelectedGenre(genreId);
    setPage(1);
    fetchMovies(genreId, 1);
  };

  const swiped = (direction, movie) => {
    if (direction === 'left') {
      saveDiscarded(movie.id);
    } else if (direction === 'right') {
      handleWatch(movie);
    }
    setMovies(prev => prev.filter(m => m.id !== movie.id));
  };

  const outOfFrame = (movie) => {
    if (movies.length === 1 && movies[0].id === movie.id) {
       setPage(p => p + 1);
       fetchMovies(selectedGenre, page + 1);
    }
  };

  const handleWatch = async (movie) => {
    setCurrentMovie(movie);
    setScreen('verify');
    setMessage(`Cerco "${movie.title}"...`);
    
    try {
      const res = await fetch(`https://filminvasion.onrender.com/api/search?q=${encodeURIComponent(movie.title)}`);
      const data = await res.json();
      
      if (res.ok && data.length > 0) {
        setStreamingOptions(data[0]);
        setMessage('');
      } else {
        setMessage('Non disponibile nei nostri archivi gratuiti.');
        saveDiscarded(movie.id);
        setTimeout(() => setScreen('swipe'), 4000);
      }
    } catch(e) {
        setMessage('Errore di connessione al server.');
        setTimeout(() => setScreen('swipe'), 3000);
    }
  };

  const startVideo = async (toTv) => {
    let castSession = null;
    if (toTv) {
      if (!isCastAvailable) {
        alert("Chromecast non supportato qui.");
        return;
      }
      // eslint-disable-next-line no-undef
      const context = cast.framework.CastContext.getInstance();
      castSession = context.getCurrentSession();
      if (!castSession) {
        try {
           await context.requestSession();
           castSession = context.getCurrentSession();
        } catch (e) {
           return;
        }
      }
    }

    setMessage(`Preparo la riproduzione...`);
    try {
      const res = await fetch(`https://filminvasion.onrender.com/api/extract?url=${encodeURIComponent(streamingOptions.url)}`);
      const data = await res.json();
      
      if (res.ok && data.videoUrl) {
         setMessage('');
         if (toTv && castSession) {
            // eslint-disable-next-line no-undef
            const mediaInfo = new chrome.cast.media.MediaInfo(data.videoUrl, 'application/x-mpegURL');
            // eslint-disable-next-line no-undef
            mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
            mediaInfo.metadata.title = currentMovie.title;
            // eslint-disable-next-line no-undef
            const request = new chrome.cast.media.LoadRequest(mediaInfo);
            castSession.loadMedia(request).then(
              () => console.log('Avviato su TV!'),
              (errorCode) => alert('Errore TV: ' + errorCode)
            );
         } else {
            setPlayingUrl(data.videoUrl);
            setScreen('player');
         }
      } else {
         setMessage('Video protetto o rimosso.');
      }
    } catch(e) {
      setMessage('Errore estrazione.');
    }
  };

  useEffect(() => {
    if (screen === 'player' && playingUrl) {
      const video = document.getElementById('video-player');
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(playingUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          video.play().catch(e => console.log(e));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playingUrl;
        video.addEventListener('loadedmetadata', function () {
          video.play().catch(e => console.log(e));
        });
      }
    }
  }, [screen, playingUrl]);

  const triggerSwipe = (dir) => {
    if(movies.length > 0) {
      swiped(dir, movies[movies.length - 1]);
    }
  }


  if (screen === 'player') {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'black', zIndex: 9999 }}>
        <button onClick={() => { setPlayingUrl(null); setScreen('verify'); }} style={{position:'absolute', top:'40px', left:'20px', background:'rgba(0,0,0,0.5)', borderRadius:'50%', border:'none', color:'white', padding:'15px', zIndex: 10000}}>
          <ChevronLeft size={35} />
        </button>
        <video id="video-player" controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }}></video>
      </div>
    );
  }

  if (screen === 'verify') {
    return (
      <div className="container verify-container">
        {currentMovie?.poster_path && (
           <img src={`https://image.tmdb.org/t/p/w500${currentMovie.poster_path}`} alt="locandina" className="verify-poster" />
        )}
        <h1 style={{ fontSize: '2.2rem', marginBottom: '30px' }}>{currentMovie?.title}</h1>
        
        {message ? (
          <div className="msg-box">{message}</div>
        ) : (
          <div className="action-buttons">
            <button className="btn-action btn-phone" onClick={() => startVideo(false)}>
              <Play size={30} fill="white" /> GUARDA QUI
            </button>
            <button className="btn-action btn-tv" onClick={() => startVideo(true)}>
              <Tv size={30} /> ALLA TV
            </button>
            <button className="btn-action btn-cancel" onClick={() => setScreen('swipe')}>
              Annulla e Torna Indietro
            </button>
          </div>
        )}
      </div>
    );
  }

  if (screen === 'swipe') {
    return (
      <div className="container swipe-container">
        <div className="swipe-header">
           <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'white' }}><ChevronLeft size={40} /></button>
           <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Scorri i Film</h2>
           <div style={{width: 40}}></div>
        </div>
        
        <div className="cardContainer">
          {movies.map((movie) => (
            <TinderCard 
              className='swipe' 
              key={movie.id} 
              onSwipe={(dir) => swiped(dir, movie)} 
              onCardLeftScreen={() => outOfFrame(movie)}
              preventSwipe={['up', 'down']}
            >
              <div className="tinder-card">
                <img src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} className="tinder-img" alt={movie.title} />
                <div className="tinder-overlay">
                  <h3 className="tinder-title">{movie.title}</h3>
                  <div className="tinder-year">{movie.release_date ? movie.release_date.substring(0,4) : ''}</div>
                  <p className="tinder-desc">{movie.overview || "Trama non disponibile."}</p>
                </div>
              </div>
            </TinderCard>
          ))}
          {movies.length === 0 && !loading && (
             <h2 style={{textAlign: 'center', color: '#666', marginTop: '50px'}}>Cerco nuovi film...</h2>
          )}
        </div>
        
        {expandedPlotMovie && (
          <div className="plot-modal" onClick={() => setExpandedPlotMovie(null)}>
            <div className="plot-modal-content" onClick={e => e.stopPropagation()}>
               <h2>{expandedPlotMovie.title}</h2>
               <p>{expandedPlotMovie.overview || "Nessuna trama."}</p>
               <button className="btn-primary" onClick={() => setExpandedPlotMovie(null)}>CHIUDI TRAMA</button>
            </div>
          </div>
        )}
        
        {/* Pulsanti fisici se non vuole usare lo swipe */}
        <div className="swipe-buttons">
           <button className="btn-circle btn-dislike" onClick={() => triggerSwipe('left')}><X size={40} strokeWidth={3} /></button>
           
           <button className="btn-circle" style={{ color: '#0A84FF', border: '2px solid rgba(10, 132, 255, 0.3)' }} onClick={() => {
              if (movies.length > 0) {
                 setExpandedPlotMovie(movies[movies.length - 1]);
              }
           }}>
              <Info size={40} strokeWidth={3} />
           </button>

           <button className="btn-circle btn-like" onClick={() => triggerSwipe('right')}><Heart size={40} strokeWidth={3} fill="currentColor" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="app-header">
        <h1 className="app-title">FILMINVASION</h1>
        <p className="app-subtitle">Cosa guardiamo oggi?</p>
      </div>

      <div className="home-scroll">
        {loading ? (
           <h2 style={{textAlign: 'center', marginTop: '50px', color: 'var(--accent-primary)'}}>Connessione in corso...</h2>
        ) : (
          <div className="genre-grid">
            {GENRES.map(g => (
              <button key={g.id} className="btn-genre" onClick={() => handleGenreClick(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        )}
        
        <div className="manual-search">
           <input className="search-input" type="text" placeholder="Cerca titolo esatto..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
           <button className="btn-primary" onClick={async () => {
                if(!searchQuery.trim()) return;
                setCurrentMovie({ title: searchQuery });
                setScreen('verify');
                setMessage(`Cerco "${searchQuery}"...`);
                try {
                  const res = await fetch(`https://filminvasion.onrender.com/api/search?q=${encodeURIComponent(searchQuery)}`);
                  const data = await res.json();
                  if (res.ok && data.length > 0) {
                    setStreamingOptions(data[0]);
                    setMessage('');
                  } else {
                    setMessage('Film non trovato.');
                    setTimeout(() => setScreen('home'), 3000);
                  }
                } catch(e) {
                   setMessage('Errore di connessione.');
                   setTimeout(() => setScreen('home'), 3000);
                }
            }}><Search size={25}/> CERCA</button>
        </div>
      </div>
    </div>
  );
}

export default App;
