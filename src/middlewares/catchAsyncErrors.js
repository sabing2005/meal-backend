export default (thefunc) => (req, res, next) => {
  Promise.resolve(thefunc(req, res, next)).catch(next);
};
