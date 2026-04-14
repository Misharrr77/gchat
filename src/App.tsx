import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-dark-900">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  return user ? <>{children}</> : <Navigate to="/auth" />;
}

function Public({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<Public><AuthPage /></Public>} />
          <Route path="/*" element={
            <Protected>
              <ChatProvider><ChatPage /></ChatProvider>
            </Protected>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
