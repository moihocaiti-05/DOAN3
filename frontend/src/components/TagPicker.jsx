import { useState, useEffect } from 'react';
import { tagApi } from '../services/tagApi';
import '../styles/tag.css';

// Component DÙNG CHUNG để chọn/gõ nhãn (Tag) cho 1 task - tái dùng ở cả CreateTaskModal và TaskDetailModal
// selectedTags: mảng TÊN nhãn (string) đang được chọn - do component CHA quản lý (state nằm ở CreateTaskModal/TaskDetailModal)
// onChange: hàm callback, được gọi lại với mảng tên nhãn MỚI mỗi khi người dùng chọn thêm/gỡ/gõ nhãn mới
export default function TagPicker({ groupId, selectedTags, onChange }) {
  const [groupTags, setGroupTags] = useState([]); // "ngân hàng nhãn" của nhóm, lấy từ Backend để gợi ý
  const [inputValue, setInputValue] = useState(''); // giá trị đang gõ trong ô nhập nhãn mới

  // Tải danh sách nhãn có sẵn của nhóm ngay khi component được hiển thị (hoặc khi đổi nhóm)
  useEffect(() => {
    if (groupId) {
      tagApi.getByGroup(groupId).then((res) => setGroupTags(res.data.data));
    }
  }, [groupId]);

  // Thêm 1 nhãn vào danh sách đang chọn - dùng chung cho cả bấm nút gợi ý VÀ gõ tay rồi nhấn Enter
  const addTag = (name) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    // Không thêm trùng nếu nhãn này (không phân biệt hoa/thường) đã có trong danh sách đang chọn rồi
    const alreadySelected = selectedTags.some((t) => t.toLowerCase() === cleanName.toLowerCase());
    if (alreadySelected) return;
    onChange([...selectedTags, cleanName]);
    setInputValue('');
  };

  // Gỡ 1 nhãn khỏi danh sách đang chọn (bấm nút x trên chip)
  const removeTag = (name) => {
    onChange(selectedTags.filter((t) => t !== name));
  };

  // Khi đang gõ trong ô nhập, nhấn Enter thì thêm nhãn ngay, đồng thời CHẶN không cho submit cả form
  // (vì input này thường nằm trong <form>, nếu không chặn sẽ vô tình bấm luôn nút Tạo/Lưu của form)
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  // Chỉ gợi ý những nhãn CÓ SẴN trong nhóm mà CHƯA nằm trong danh sách đang chọn (tránh gợi ý trùng)
  const suggestions = groupTags.filter(
    (gt) => !selectedTags.some((t) => t.toLowerCase() === gt.name.toLowerCase())
  );

  return (
    <div className="tag-picker">
      {/* Các nhãn ĐANG ĐƯỢC CHỌN, hiện dạng "chip" bo tròn, có nút x để gỡ */}
      {selectedTags.length > 0 && (
        <div className="tag-picker-selected">
          {selectedTags.map((name) => (
            <span key={name} className="tag-chip">
              {name}
              <button type="button" onClick={() => removeTag(name)}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Ô gõ tên nhãn mới - gõ xong nhấn Enter để thêm (nhãn chưa có trong nhóm sẽ tự tạo mới ở Backend) */}
      <input
        type="text"
        className="tag-picker-input"
        placeholder="Gõ tên nhãn rồi nhấn Enter..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
      />

      {/* Gợi ý các nhãn có sẵn trong nhóm - bấm vào là chọn ngay, không cần gõ lại */}
      {suggestions.length > 0 && (
        <div className="tag-picker-suggestions">
          {suggestions.map((gt) => (
            <button
              type="button"
              key={gt.id}
              className="tag-suggestion-btn"
              onClick={() => addTag(gt.name)}
            >
              + {gt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}