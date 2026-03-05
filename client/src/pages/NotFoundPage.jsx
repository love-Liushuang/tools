import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <main className="notfound">
      <h1>404</h1>
      <p>页面不存在，可能是路径写错了。</p>
      <Link to="/">返回首页</Link>
    </main>
  );
}

export default NotFoundPage;
