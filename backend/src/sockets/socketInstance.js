// File này chỉ làm 1 việc: giữ 1 "tham chiếu dùng chung" tới đối tượng io,
// để bất kỳ Service nào (task, group...) cũng lấy ra dùng được,
// mà không cần truyền io qua lại phức tạp giữa nhiều file
let ioInstance = null;

exports.init = (io) => {
  ioInstance = io;
};

exports.getIO = () => ioInstance;