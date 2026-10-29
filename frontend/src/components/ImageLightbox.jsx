// Component hiển thị ảnh phóng to toàn màn hình (lightbox), có nút Tải về và nút Đóng
export default function ImageLightbox({ imageUrl, fileName, onClose, onDownload }) {
  if (!imageUrl) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-filename">{fileName}</span>
        <div className="lightbox-actions">
          <button className="btn-secondary" onClick={onDownload}>⬇ Tải về</button>
          <button className="lightbox-close" onClick={onClose}>✕</button>
        </div>
      </div>
      {/* stopPropagation để bấm vào ảnh không bị đóng lightbox theo overlay */}
      <img
        src={imageUrl}
        alt={fileName}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}