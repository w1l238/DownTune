import { Routes, Route } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { DownloadProvider, useDownloads } from './contexts/DownloadContext';
import { applyAccent, applySpeed, applyDensity, applySongLayout } from './utils/appearance';
import Sidebar from './components/Sidebar';
import QueueDock from './components/QueueDock';
import Popup from './components/Popup';
import Home from './pages/Home';
import Results from './pages/Results';
import Settings from './pages/Settings';
import Library from './pages/Library';
import Albums from './pages/Albums';
import Artists from './pages/Artists';
import Queue from './pages/Queue';
import AlbumDetail from './pages/AlbumDetail';
import './App.css';

function Shell() {
    const [collapsed, setCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });
    const { downloads, notification, dismissNotification } = useDownloads();
    const hasDownloads = downloads.length > 0;
    // Delay removing the dock row so the exit animation can finish
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
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/results" element={<Results />} />
                        <Route path="/library" element={<Library />} />
                        <Route path="/albums" element={<Albums />} />
                        <Route path="/artists" element={<Artists />} />
                        <Route path="/queue" element={<Queue />} />
                        <Route path="/album/:albumName" element={<AlbumDetail />} />
                        <Route path="/settings" element={<Settings />} />
                    </Routes>
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
            <Shell />
        </DownloadProvider>
    );
}

export default App;
