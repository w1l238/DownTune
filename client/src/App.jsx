import { Routes, Route } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { DownloadProvider, useDownloads } from './contexts/DownloadContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { applyAccent, applySpeed, applyDensity } from './utils/appearance';
import Sidebar from './components/Sidebar';
import QueueDock from './components/QueueDock';
import Popup from './components/Popup';
import './App.css';

const Home         = lazy(() => import('./pages/Home'));
const Results      = lazy(() => import('./pages/Results'));
const Settings     = lazy(() => import('./pages/Settings'));
const Library      = lazy(() => import('./pages/Library'));
const Albums       = lazy(() => import('./pages/Albums'));
const Artists      = lazy(() => import('./pages/Artists'));
const Queue        = lazy(() => import('./pages/Queue'));
const AlbumDetail  = lazy(() => import('./pages/AlbumDetail'));
const SearchArtist = lazy(() => import('./pages/SearchArtist'));
const SearchAlbum  = lazy(() => import('./pages/SearchAlbum'));

function Shell() {
    const [collapsed, setCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });
    const { downloads, notification, dismissNotification } = useDownloads();
    const hasDownloads = downloads.length > 0;
    const [showDockRow, setShowDockRow] = useState(false);
    const dockRowTimerRef = useRef(null);

    useEffect(() => {
        if (hasDownloads) {
            if (dockRowTimerRef.current) {
                clearTimeout(dockRowTimerRef.current);
                dockRowTimerRef.current = null;
            }
            setShowDockRow(true);
        } else {
            dockRowTimerRef.current = setTimeout(() => setShowDockRow(false), 500);
        }
        return () => clearTimeout(dockRowTimerRef.current);
    }, [hasDownloads]);

    const toggleCollapse = () => {
        setCollapsed(prev => {
            localStorage.setItem('sidebar_collapsed', !prev);
            return !prev;
        });
    };

    useEffect(() => {
        const bgImage = localStorage.getItem('app_bg_image');
        const bgGradient = localStorage.getItem('app_background');
        const bgDim = localStorage.getItem('app_bg_dim');
        const blurBase = parseFloat(localStorage.getItem('app_blur_base') || '10');

        if (bgImage) {
            document.body.style.background = `url(${bgImage}) center / cover fixed`;
            document.body.style.animation = 'none';
        } else if (bgGradient) {
            document.documentElement.style.setProperty('--app-background', bgGradient);
        }
        if (bgDim) {
            document.body.style.setProperty('--bg-dim', bgDim);
        }

        const r = document.documentElement.style;
        r.setProperty('--sd-blur-sm', `${blurBase * 0.5}px`);
        r.setProperty('--sd-blur-md', `${blurBase}px`);
        r.setProperty('--sd-blur-lg', `${blurBase * 1.5}px`);
        r.setProperty('--sd-blur-xl', `${blurBase * 2}px`);

        applyAccent(localStorage.getItem('app_accent') || 'teal');
        applySpeed(localStorage.getItem('app_animation_speed') || 'normal');
        applyDensity(localStorage.getItem('app_density') || 'normal');
    }, []);

    return (
        <div className={`shell ${!showDockRow ? 'no-queue' : ''}`}>
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
            <main className="main">
                <div className="canvas">
                    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', opacity: 0.4 }}>Loading…</div>}>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/results" element={<Results />} />
                            <Route path="/library" element={<Library />} />
                            <Route path="/albums" element={<Albums />} />
                            <Route path="/artists" element={<Artists />} />
                            <Route path="/queue" element={<Queue />} />
                            <Route path="/album/:albumName" element={<AlbumDetail />} />
                            <Route path="/search/artist/:id" element={<SearchArtist />} />
                            <Route path="/search/album/:id"  element={<SearchAlbum />} />
                            <Route path="/settings" element={<Settings />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>
            <QueueDock />
            {notification.visible && (
                <Popup
                    message={notification.message}
                    type={notification.type}
                    onClose={dismissNotification}
                />
            )}
        </div>
    );
}

function App() {
    return (
        <DownloadProvider>
            <LibraryProvider>
                <Shell />
            </LibraryProvider>
        </DownloadProvider>
    );
}

export default App;
