import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Layout.module.css';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isMapView = location.pathname.match(/\/maps\/\d+$/);

  if (isMapView) return <Outlet />;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1
          className={styles.logo}
          onClick={() => navigate('/campaigns')}
          role="button"
          tabIndex={0}
        >
          HexMap
        </h1>
        {user && (
          <div className={styles.headerRight}>
            <span className={styles.username}>{user.name}</span>
            <button className={styles.logoutBtn} onClick={logout}>
              Logout
            </button>
          </div>
        )}
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
