import { Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoginModal } from '@/components/layout/LoginModal';

export function AppShell() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginModal />;
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar />
      <main className="flex-1 scroll-area">
        <div className="w-full px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
