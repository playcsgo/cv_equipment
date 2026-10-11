// game rules

const MAX_LEVEL = 4
const LEVEL_UP_COST = 500
const SLOTS = ['helmet_lv', 'armor_lv', 'weapon_lv']
const DEFAULT_UPGRADE_RATES = { 1: 0.9, 2: 0.8, 3: 0.7 }

const parseRates = (text) => {
  const rates = text.split(',').map(Number)
  if (
    rates.length !== MAX_LEVEL - 1 ||
    rates.some((r) => !(r >= 0 && r <= 1))
  ) {
    throw new Error(
      `UPGRADE_RATES requires ${MAX_LEVEL - 1} values between 0 and 1, received ${text}`,
    )
  }
  return Object.fromEntries(rates.map((r, i) => [i + 1, r]))
}

const UPGRADE_RATES = process.env.UPGRADE_RATES
  ? parseRates(process.env.UPGRADE_RATES)
  : DEFAULT_UPGRADE_RATES

const upgradeRate = (level) => UPGRADE_RATES[level] ?? 0

module.exports = {
  MAX_LEVEL,
  LEVEL_UP_COST,
  SLOTS,
  UPGRADE_RATES,
  upgradeRate,
}
