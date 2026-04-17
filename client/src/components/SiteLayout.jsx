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
            <NavLink to="/tools/video-download">视频下载</NavLink>
            <NavLink to="/tools/text-letter">文本加密</NavLink>
            <NavLink to="/tools/unlock-pdf">PDF解密</NavLink>
            <NavLink to="/tools/image-convert">图片转换</NavLink>
            <NavLink to="/tools/changelog">更新日志</NavLink>
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export default SiteLayout;
