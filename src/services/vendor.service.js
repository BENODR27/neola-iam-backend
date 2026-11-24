const { Op, where: sqlWhere, fn, col } = require("sequelize");
const { Vendor } = require("../models");
const HttpError = require("../errors/HttpError");
const {
  filterVendors,
  assertVendorScope,
  vendorAssignments,
} = require("../security/data-scope");

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function payload(values) {
  const result = { ...values };
  result.code = text(values.code);
  result.name = text(values.name);
  if (!result.code || !result.name)
    throw new HttpError(400, "Vendor code and name are required");
  result.category = text(values.category) || "General";
  result.contactName = text(values.contactName || values.contact);
  result.phone = text(values.phone);
  result.email = text(values.email);
  result.organizationId = text(values.organizationId);
  result.organizationName = text(values.organizationName);
  result.factoryId = text(values.factoryId);
  result.factoryName = text(values.factoryName);
  result.serviceLevel = text(values.serviceLevel) || "Standard";
  result.status = text(values.status) || "Active";
  result.notes = text(values.notes);
  return result;
}

async function list(req) {
  const where = {};
  if (req.query.search)
    where[Op.or] = [
      { code: { [Op.iLike]: `%${req.query.search}%` } },
      { name: { [Op.iLike]: `%${req.query.search}%` } },
      { category: { [Op.iLike]: `%${req.query.search}%` } },
    ];
  return filterVendors(
    req,
    await Vendor.findAll({ where, order: [["name", "ASC"]] }),
  );
}
async function listPage(req) {
  const page = Number(req.query.page || 1),
    pageSize = Number(req.query.pageSize || 25);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  )
    throw new HttpError(422, "Invalid vendor page or pageSize");
  const scopes = vendorAssignments(req);
  const match = (fields, values) => ({
    [Op.or]: fields.flatMap((field) =>
      values.map((value) =>
        sqlWhere(
          fn(
            "lower",
            fn("btrim", col(Vendor.rawAttributes[field].field || field)),
          ),
          String(value).trim().toLowerCase(),
        ),
      ),
    ),
  });
  const clauses = [];
  if (scopes !== null)
    clauses.push({
      [Op.or]: scopes.length
        ? scopes.map((scope) => {
            const organizations = [
              scope.organizationId,
              scope.organizationName,
            ].filter((value) => value && String(value).trim());
            const factories = [scope.factoryId, scope.factoryName].filter(
              (value) => value && String(value).trim(),
            );
            return {
              [Op.and]: [
                organizations.length
                  ? match(["organizationId", "organizationName"], organizations)
                  : {},
                factories.length
                  ? match(["factoryId", "factoryName"], factories)
                  : {},
              ],
            };
          })
        : [sqlWhere(col("id"), null)],
    });
  if (req.query.search) {
    if (typeof req.query.search !== "string" || req.query.search.length > 200)
      throw new HttpError(422, "Invalid vendor search");
    const term = `%${req.query.search.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push({
      [Op.or]: ["code", "name", "category"].map((key) => ({
        [key]: { [Op.iLike]: term },
      })),
    });
  }
  const { rows, count } = await Vendor.findAndCountAll({
    where: { [Op.and]: clauses },
    order: [
      ["name", "ASC"],
      ["id", "ASC"],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    result: rows,
    total: count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
  };
}
async function create(req) {
  const values = payload(req.body || {});
  assertVendorScope(req, values);
  return Vendor.create(values);
}
async function update(req) {
  const vendor = await Vendor.findByPk(req.params.id);
  if (!vendor) throw new HttpError(404, "Vendor not found");
  assertVendorScope(req, vendor);
  const values = payload({ ...vendor.toJSON(), ...(req.body || {}) });
  assertVendorScope(req, values);
  await vendor.update(values);
  return vendor;
}
async function remove(req) {
  const vendor = await Vendor.findByPk(req.params.id);
  if (!vendor) throw new HttpError(404, "Vendor not found");
  assertVendorScope(req, vendor);
  await vendor.destroy();
}

module.exports = { list, listPage, create, update, remove };
