// 遊戲規則：worker、route、畫面共用同一份，要調整只改這裡
// （原本 MAX_LEVEL、500 分別寫死在 worker 和 gearButton.hbs，改一邊忘了另一邊就會不一致）
module.exports = {
  MAX_LEVEL: 4,
  LEVEL_UP_COST: 500,
  SLOTS: ['helmet_lv', 'armor_lv', 'weapon_lv'],
}
