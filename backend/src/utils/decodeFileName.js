// MỚI THÊM: Sửa lỗi vỡ dấu tên file tiếng Việt khi upload bằng multer
// Nguyên nhân: trình duyệt gửi tên file dạng UTF-8, nhưng multer đọc nhầm theo kiểu "latin1",
// nên "Chương" thành các ký tự lạ. Cách sửa: lấy lại đúng các byte gốc (latin1) rồi đọc lại theo UTF-8
exports.decodeFileName = (name) => {
  if (!name) return name;

  // Nếu chuỗi đã có ký tự nằm ngoài dải latin1 (mã > 255) thì nó ĐÃ là Unicode đúng rồi
  // (VD multer bản mới tự đọc UTF-8) - giữ nguyên, tránh "sửa" lần 2 làm hỏng tên file
  if (/[^\u0000-\u00FF]/.test(name)) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');

  // Nếu đọc lại ra ký tự lỗi "�" nghĩa là tên gốc không phải UTF-8 bị đọc nhầm (VD "café" vốn đã đúng)
  // -> giữ nguyên tên cũ cho an toàn
  return decoded.includes('\uFFFD') ? name : decoded;
};