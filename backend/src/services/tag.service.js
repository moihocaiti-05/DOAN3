const tagRepository = require('../repositories/tag.repository');

// Lấy danh sách nhãn có sẵn của 1 nhóm, dùng cho ô gợi ý khi tạo/sửa task
exports.getGroupTags = (groupId) => tagRepository.findByGroup(groupId);