const nodemailer = require('nodemailer'); // thư viện gửi email qua SMTP (ở đây dùng SMTP của Gmail)

// transporter = "bưu tá" gửi mail; chỉ tạo 1 lần rồi dùng lại cho mọi lần gửi (tạo lười: lần gửi đầu tiên mới tạo)
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    // App Password của Google hay được hiển thị kèm dấu cách (abcd efgh ijkl mnop) -> bỏ hết khoảng trắng cho chắc
    const pass = (process.env.MAIL_APP_PASSWORD || '').replace(/\s/g, '');
    transporter = nodemailer.createTransport({
      service: 'gmail', // nodemailer tự biết host/port của Gmail
      auth: { user: process.env.MAIL_USER, pass },
    });
  }
  return transporter;
};

// Chống chèn HTML: tên người dùng tự nhập nên phải "escape" trước khi đưa vào nội dung mail
const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// MỚI THÊM: bỏ xuống dòng trong chuỗi dùng làm tiêu đề mail (chặn chèn thêm dòng header thư)
const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ').trim();

// MỚI THÊM: kiểm tra đã cấu hình .env chưa để báo lỗi dễ hiểu thay vì lỗi đăng nhập Gmail khó đọc
const ensureConfigured = () => {
  if (!process.env.MAIL_USER || !process.env.MAIL_APP_PASSWORD) {
    throw new Error('Chưa cấu hình MAIL_USER hoặc MAIL_APP_PASSWORD trong file .env');
  }
};

// MỚI THÊM: chuỗi người gửi hiển thị trong hộp thư, dạng "Tên" <email>
// Bỏ dấu " trong tên để không làm hỏng định dạng
const getFromAddress = () => {
  const fromName = (process.env.MAIL_FROM_NAME || 'Quản lý đồ án').replace(/"/g, '');
  return `"${fromName}" <${process.env.MAIL_USER}>`;
};

// Gửi mail chứa mã xác nhận 6 số
// Nếu gửi lỗi thì hàm này ném lỗi ra ngoài (Service sẽ bắt và báo cho người dùng)
exports.sendVerificationCode = async ({ to, fullName, code, expireMinutes }) => {
  ensureConfigured();

  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: `Mã xác nhận email của bạn: ${code}`,
    // Bản chữ thuần: cho các ứng dụng mail không hiển thị được HTML
    text: `Xin chào ${fullName},\n\nMã xác nhận email của bạn là: ${code}\nMã có hiệu lực trong ${expireMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.\n\nNếu bạn không đăng ký tài khoản, hãy bỏ qua email này.`,
    // Bản HTML: hiển thị đẹp hơn
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #151B26;">
        <h2 style="margin-bottom: 8px;">Xác nhận email</h2>
        <p>Xin chào <b>${escapeHtml(fullName)}</b>,</p>
        <p>Mã xác nhận email của bạn là:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #FC636B; margin: 16px 0;">${code}</p>
        <p>Mã có hiệu lực trong <b>${expireMinutes} phút</b>. Không chia sẻ mã này cho bất kỳ ai.</p>
        <p style="color: #6B7280; font-size: 13px;">Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.</p>
      </div>
    `,
  });
};

// MỚI THÊM: chữ hiển thị tiếng Việt cho độ ưu tiên và trạng thái của task
const PRIORITY_TEXT = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
const STATUS_TEXT = { todo: 'Chưa làm', doing: 'Đang làm', review: 'Kiểm định', redo: 'Làm lại', done: 'Hoàn thành' }; // MỚI SỬA (Phiên 12): thêm review

// MỚI THÊM: đổi deadline (Date) thành "dd/mm/yyyy"
// Dùng toISOString() (giờ UTC) vì deadline lưu ở 00:00 UTC, đổi theo giờ máy chủ có thể lệch sang ngày hôm trước
const formatDate = (date) => {
  if (!date) return 'Chưa có';
  const [year, month, day] = new Date(date).toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

// MỚI THÊM: Gửi 1 mail GỘP nhiều công việc cho 1 người nhận
// tasks: mảng { title, assigneeName, priority, status, deadline, tags: [tên nhãn], isYours }
// isYours = true nếu task đó được giao cho chính người nhận -> đánh dấu "Giao cho bạn"
// Nếu gửi lỗi thì ném lỗi ra ngoài (Service bắt riêng từng người để 1 mail lỗi không làm hỏng các mail khác)
exports.sendTaskDigest = async ({ to, recipientName, senderName, groupName, groupId, tasks, message }) => {
  ensureConfigured();

  // Đường dẫn mở nhóm: chỉ có khi .env khai báo CLIENT_URL (VD http://localhost:5173), không có thì bỏ nút đi
  const clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
  const groupLink = clientUrl ? `${clientUrl}/groups/${groupId}` : '';

  // Mỗi công việc 1 dòng trong bảng HTML
  const rowsHtml = tasks
    .map(
      (t) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">
            <b>${escapeHtml(t.title)}</b>
            ${t.isYours ? '<span style="background:#FC636B;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px;">Giao cho bạn</span>' : ''}
            ${t.tags.length > 0 ? `<div style="color:#6B7280;font-size:12px;">${t.tags.map((n) => escapeHtml(n)).join(', ')}</div>` : ''}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(t.assigneeName)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${PRIORITY_TEXT[t.priority] || t.priority}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${STATUS_TEXT[t.status] || t.status}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${formatDate(t.deadline)}</td>
        </tr>`
    )
    .join('');

  // Bản chữ thuần: mỗi công việc 1 dòng
  const rowsText = tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title}${t.isYours ? ' [Giao cho bạn]' : ''} | Phụ trách: ${t.assigneeName} | Ưu tiên: ${PRIORITY_TEXT[t.priority] || t.priority} | Trạng thái: ${STATUS_TEXT[t.status] || t.status} | Hạn: ${formatDate(t.deadline)}`
    )
    .join('\n');

  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: oneLine(`[${groupName}] ${tasks.length} công việc từ ${senderName}`),
    text: `Xin chào ${recipientName},\n\n${senderName} gửi bạn ${tasks.length} công việc trong nhóm "${groupName}":\n\n${rowsText}\n${message ? `\nLời nhắn: ${message}\n` : ''}${groupLink ? `\nMở nhóm: ${groupLink}\n` : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #151B26;">
        <h2 style="margin-bottom: 4px;">${tasks.length} công việc từ ${escapeHtml(senderName)}</h2>
        <p style="color: #6B7280; margin-top: 0;">Nhóm: <b>${escapeHtml(groupName)}</b></p>
        <p>Xin chào <b>${escapeHtml(recipientName)}</b>,</p>
        ${message ? `<p style="white-space: pre-wrap; background: #F9FAFB; border-left: 3px solid #FC636B; padding: 8px 12px;">${escapeHtml(message)}</p>` : ''}
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <thead>
            <tr style="background: #F3F4F6; text-align: left;">
              <th style="padding: 8px;">Công việc</th>
              <th style="padding: 8px;">Phụ trách</th>
              <th style="padding: 8px;">Ưu tiên</th>
              <th style="padding: 8px;">Trạng thái</th>
              <th style="padding: 8px;">Hạn</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${groupLink ? `<p style="margin-top: 20px;"><a href="${groupLink}" style="background:#FC636B;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;">Mở nhóm</a></p>` : ''}
      </div>
    `,
  });
};