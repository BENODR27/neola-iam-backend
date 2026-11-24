const vendors = require("../services/vendor.service");
async function list(req, res) {
  res.json(
    req.query.pageSize
      ? { status: 200, ...(await vendors.listPage(req)) }
      : { status: 200, result: await vendors.list(req) },
  );
}
async function create(req, res) {
  res.status(201).json({ status: 201, result: await vendors.create(req) });
}
async function update(req, res) {
  res.json({ status: 200, result: await vendors.update(req) });
}
async function remove(req, res) {
  await vendors.remove(req);
  res.status(204).send();
}
module.exports = { list, create, update, remove };
