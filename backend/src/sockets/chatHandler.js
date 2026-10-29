const jwt = require('jsonwebtoken'); // MỚI THÊM: để kiểm tra token đăng nhập ngay lúc kết nối socket
const messageService = require('../services/message.service');

// File này chứa toàn bộ logic xử lý sự kiện Socket.io liên quan đến chat và thông báo
// "io" là đối tượng Socket.io server chính, được truyền từ server.js vào
module.exports = (io) => {
  // MỚI THÊM: "cổng kiểm tra vé" - chạy 1 lần cho MỖI kết nối mới, TRƯỚC khi cho vào
  // Frontend gửi token ở bước kết nối (socket.handshake.auth.token). Token sai, hết hạn hoặc không có -> từ chối luôn
  // Người kết nối thành công được gắn socket.user.id lấy từ token (đáng tin), KHÔNG tin id do Frontend gửi lên nữa
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Chưa đăng nhập'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.id) {
        return next(new Error('Token không hợp lệ'));
      }
      socket.user = { id: decoded.id };
      next();
    } catch (error) {
      next(new Error('Token không hợp lệ hoặc đã hết hạn'));
    }
  });

  io.on('connection', (socket) => {
    // MỚI THÊM: id người dùng lấy từ token đã kiểm tra ở trên
    const userId = socket.user.id;
    console.log('Client connected:', socket.id, 'user:', userId);

    // MỚI SỬA: tự cho vào phòng thông báo riêng của CHÍNH MÌNH ngay khi kết nối (id lấy từ token)
    // Trước đây phải đợi Frontend gửi "join_notifications" kèm userId, nên ai gửi id người khác là nghe lén được thông báo của họ
    // (nhờ vậy khi mạng rớt rồi nối lại, phòng thông báo cũng tự có lại)
    socket.join(`notification_${userId}`);

    // MỚI SỬA: "join_group" - chỉ cho vào phòng chat của nhóm nếu người này được chat trong nhóm
    // (thành viên đã đồng ý HOẶC Giảng viên đã đồng ý, dùng lại assertCanChat). Người ngoài nhóm không nghe được tin realtime
    // Room trong Socket.io giống như 1 kênh riêng, chỉ ai trong phòng mới nhận được tin nhắn phòng đó
    socket.on('join_group', async (groupId) => {
      try {
        if (typeof groupId !== 'string') throw new Error('Thiếu mã nhóm');
        await messageService.assertCanChat(userId, groupId);
        socket.join(groupId);
        console.log(`Socket ${socket.id} joined group ${groupId}`);
      } catch (error) {
        // Báo riêng cho người xin vào, không ảnh hưởng ai khác
        socket.emit('join_error', { message: error.message });
      }
    });

    // Sự kiện "leave_group": khi user rời khỏi trang nhóm (chuyển trang khác)
    socket.on('leave_group', (groupId) => {
      if (typeof groupId === 'string') socket.leave(groupId);
    });

    // MỚI SỬA: không còn xử lý "join_notifications" - việc vào phòng thông báo đã tự làm ở lúc kết nối (phía trên)
    // Frontend cũ vẫn gửi sự kiện này thì Socket.io tự bỏ qua, không gây lỗi

    // Sự kiện "send_message": khi user gửi 1 tin nhắn chữ
    // data gồm: { content, groupId } - MỚI SỬA: người gửi KHÔNG lấy từ data.senderId nữa mà lấy từ token (userId)
    socket.on('send_message', async (data) => {
      try {
        const { content, groupId } = data || {};
        if (typeof groupId !== 'string') throw new Error('Thiếu mã nhóm');

        // sendMessage tự kiểm tra người gửi có được chat trong nhóm không (thành viên HOẶC Giảng viên)
        await messageService.sendMessage(content, groupId, userId);

        // Lấy lại thông tin đầy đủ (kèm tên người gửi) để phát cho mọi người
        const fullMessages = await messageService.getMessagesByGroup(groupId, userId);
        const fullMessage = fullMessages[fullMessages.length - 1]; // tin nhắn vừa tạo là cái cuối cùng

        // io.to(groupId).emit(...) -> phát tin nhắn tới TẤT CẢ người đang ở trong room "groupId"
        // (bao gồm cả người vừa gửi, để họ cũng thấy tin nhắn của mình xuất hiện ngay)
        io.to(groupId).emit('new_message', fullMessage);
      } catch (error) {
        // Nếu lỗi (VD: không thuộc nhóm), chỉ báo lỗi riêng cho người gửi, không ảnh hưởng người khác
        socket.emit('message_error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};