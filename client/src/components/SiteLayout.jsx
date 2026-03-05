import { Link, NavLink, Outlet } from 'react-router-dom';

function SiteLayout() {
  return (
    <div className="site-bg">
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" to="/">
            BoxTools
          </Link>
          <nav className="topnav">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/tools/json-formatter">JSON</NavLink>
            <NavLink to="/tools/base64">Base64</NavLink>
            <NavLink to="/tools/text-stats">文本统计</NavLink>
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export default SiteLayout;
