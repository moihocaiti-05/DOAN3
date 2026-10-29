// MỚI THÊM (tính năng 5): tiện ích ngày giờ THEO GIỜ VIỆT NAM, dùng chung để mọi nơi cùng 1 cách tính "hôm nay"
// (máy chủ đặt ở múi giờ nào cũng cho kết quả giống nhau)
const TZ = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Tách ngày giờ theo giờ Việt Nam thành các phần (year, month, day, hour, minute)
const partsOf = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(date));
  const out = {};
  parts.forEach((p) => {
    out[p.type] = p.value;
  });
  return out;
};

// "Hôm nay" = 00:00 giờ Việt Nam (cùng quy ước với báo cáo tiến độ của nhóm)
const startOfTodayVN = () => {
  const p = partsOf(new Date());
  return new Date(`${p.year}-${p.month}-${p.day}T00:00:00+07:00`);
};

module.exports = { TZ, MS_PER_DAY, partsOf, startOfTodayVN };