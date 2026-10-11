const { upgradeRate } = require('./config/game')

module.exports = {
  eq: (a, b) => {
    return Number(a) === Number(b)
  },
  gte: (a, b) => {
    return Number(a) >= Number(b)
  },
  lt: (a, b) => {
    return Number(a) < Number(b)
  },
  or: (a, b) => {
    return a || b
  },
  // success rate for upgrading from the current level, e.g. 0.8 -> 80
  ratePercent: (lv) => {
    return Math.round(upgradeRate(Number(lv)) * 100)
  },
}
