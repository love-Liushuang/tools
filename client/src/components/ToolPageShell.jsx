import { Link } from 'react-router-dom';

function ToolPageShell({ title, desc, children }) {
  return (
    <main className="tool-page">
      <div className="tool-head">
        <div>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
        <Link className="ghost-btn" to="/">
          返回首页
        </Link>
      </div>
      <section className="tool-card">{children}</section>
    </main>
  );
}

export default ToolPageShell;
