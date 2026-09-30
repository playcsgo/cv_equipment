module.exports = {
  eq:(a, b) => {
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
  }
}
