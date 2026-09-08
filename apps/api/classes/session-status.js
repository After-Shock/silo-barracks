let status = { state: 'connecting', lastSuccessAt: null };
module.exports = {
  get: () => status,
  set: value => { status = value; },
};
