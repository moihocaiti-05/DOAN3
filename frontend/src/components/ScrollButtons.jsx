import { useEffect, useState } from 'react';

import '../styles/scroll_buttons.css';

// Hai nút mũi tên nổi: lên đầu trang / xuống cuối trang.
// - Nút ↑ chỉ hiện khi đã cuộn xuống một đoạn.
// - Nút ↓ chỉ hiện khi chưa ở cuối trang.
const THRESHOLD = 200;

function ScrollButtons() {
  const [showUp, setShowUp] = useState(false);
  const [showDown, setShowDown] = useState(false);

  useEffect(() => {
    const update = () => {
      const top = window.scrollY;
      const bottom = document.documentElement.scrollHeight - window.innerHeight - top;
      setShowUp(top > THRESHOLD);
      setShowDown(bottom > THRESHOLD);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    // Trang dài ra / ngắn lại khi thêm hoặc xóa task thì tính lại
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (observer) observer.disconnect();
    };
  }, []);

  const goTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const goBottom = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });

  if (!showUp && !showDown) return null;

  return (
    <div className="sb-wrap">
      {showUp && (
        <button type="button" className="sb-btn" onClick={goTop} title="Lên đầu trang" aria-label="Lên đầu trang">
          ↑
        </button>
      )}
      {showDown && (
        <button type="button" className="sb-btn" onClick={goBottom} title="Xuống cuối trang" aria-label="Xuống cuối trang">
          ↓
        </button>
      )}
    </div>
  );
}

export default ScrollButtons;