import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthPages';
import { ConverterPage } from './pages/ConverterPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { TransferDetailsPage } from './pages/TransferDetailsPage';
import { DevicesPage } from './pages/DevicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SpeedAccelerationHub } from './components/SpeedAccelerationHub';
import { HelpModal } from './components/HelpModal';

function MainApp() {
  const { preferences } = useAuth();

  const getRouteFromPath = () => {
    const path = window.location.pathname.replace(/^\//, '') || 'home';
    if (window.location.search.includes('session=') || window.location.search.includes('code=')) return 'receive';
    if (path === 'signup') return 'register';
    return path;
  };

  const [currentRoute, setCurrentRoute] = useState<string>(getRouteFromPath);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRouteFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Ensure light mode is consistently applied and cleanup dark mode artifacts
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light';
    try {
      localStorage.removeItem('swiftdrop_theme');
    } catch {}
  }, []);

  const navigateTo = (route: string) => {
    let cleanRoute = route;
    if (route === 'signup') cleanRoute = 'register';
    const targetPath = cleanRoute === 'home' ? '/' : `/${cleanRoute}`;
    if (window.location.pathname + window.location.search !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setCurrentRoute(cleanRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Render route content
  const renderRoute = () => {
    if (currentRoute === 'home' || currentRoute === 'send' || currentRoute.startsWith('receive')) {
      const tab = currentRoute.startsWith('receive') ? 'receive' : 'send';
      return (
        <HomePage
          initialTab={tab}
          onNavigate={(nextTab) => navigateTo(nextTab)}
          onOpenHelp={() => setIsHelpOpen(true)}
        />
      );
    }
    if (currentRoute === 'converter') {
      return <ConverterPage onBackToHome={() => navigateTo('home')} />;
    }
    if (currentRoute === 'login') {
      return <LoginPage onNavigate={navigateTo} />;
    }
    if (currentRoute === 'register' || currentRoute === 'signup') {
      return <RegisterPage onNavigate={navigateTo} />;
    }
    if (currentRoute === 'forgot-password') {
      return <ForgotPasswordPage onNavigate={navigateTo} />;
    }
    if (currentRoute.startsWith('reset-password')) {
      return <ResetPasswordPage onNavigate={navigateTo} />;
    }
    if (currentRoute === 'dashboard') {
      return <DashboardPage onNavigate={navigateTo} />;
    }
    if (currentRoute === 'history') {
      return <HistoryPage onNavigate={navigateTo} />;
    }
    if (currentRoute.startsWith('history/')) {
      const transferId = currentRoute.replace('history/', '');
      return <TransferDetailsPage transferId={transferId} onNavigate={navigateTo} />;
    }
    if (currentRoute.startsWith('transfer/')) {
      const transferId = currentRoute.replace('transfer/', '');
      return <TransferDetailsPage transferId={transferId} onNavigate={navigateTo} />;
    }
    if (currentRoute === 'devices') {
      return <DevicesPage />;
    }
    if (currentRoute === 'settings' || currentRoute.startsWith('settings/')) {
      const sub = currentRoute.replace('settings/', '');
      const tab = sub === 'security' ? 'security' : sub === 'privacy' ? 'privacy' : 'profile';
      return <SettingsPage initialTab={tab} onNavigate={navigateTo} />;
    }
    if (currentRoute === 'speed') {
      return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <SpeedAccelerationHub onStartTransfer={() => navigateTo('send')} />
        </div>
      );
    }

    return (
      <HomePage
        initialTab="send"
        onNavigate={(tab) => navigateTo(tab)}
        onOpenHelp={() => setIsHelpOpen(true)}
      />
    );
  };

  return (
    <div className="w-full min-h-screen min-h-[100dvh] bg-[#faf9f5] text-[#1b1c1a] flex flex-col font-sans selection:bg-[#ffdbd0] selection:text-[#390c00]">
      <Header
        currentTab={currentRoute}
        onNavigate={navigateTo}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <main className="w-full pt-28 sm:pt-32 md:pt-24 bg-[#faf9f5] flex-1 flex flex-col">
        {renderRoute()}
      </main>

      <Footer
        onNavigate={navigateTo}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
