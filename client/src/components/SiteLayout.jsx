import { Link, NavLink, Outlet } from 'react-router-dom';

function SiteLayout() {
  return (
    <div className="site-bg">
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" to="/">
            ABIGBOOK BoxTools
          </Link>
          <nav className="topnav">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/hot">实时热点</NavLink>
            <NavLink to="/tools/text-letter">文本加密</NavLink>
            <NavLink to="/tools/unlock-pdf">PDF解密</NavLink>
            <NavLink to="/tools/image-convert">图片转换</NavLink>
            <a
              className="topnav-external"
              href="https://www.131417.net"
              target="_blank"
              rel="noreferrer"
            >
              <span className="topnav-external-title">
                <span className="topnav-external-mark" aria-hidden="true">🔥</span>
                资源站
              </span>
              <span className="topnav-external-sub">建设中</span>
            </a>
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export default SiteLayout;
