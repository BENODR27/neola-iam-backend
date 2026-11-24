const { randomUUID } = require("node:crypto");
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");
const HttpError = require("../errors/HttpError");
const { userHasPermission } = require("../security/permissions");
const { hierarchyPermissions } = require("../security/master-permissions");
const kinds = [
  "organization",
  "factories",
  "departments",
  "production-lines",
  "organization-units",
  "units",
  "currencies",
  "employees",
  "contacts",
  "vendors",
];
const parents = {
  Company: [],
  "Business Unit": ["Company"],
  Factory: ["Company", "Business Unit"],
  Building: ["Factory"],
  Floor: ["Building", "Factory"],
  Department: ["Floor", "Factory"],
  "Production Section": ["Department"],
  "Production Line": ["Production Section", "Department", "Floor"],
  "Machine Location": ["Production Line", "Department", "Floor"],
};
const modules = {
  Company: "organization",
  "Business Unit": "organization",
  Factory: "factories",
  Department: "departments",
  "Production Line": "production-lines",
};
const query = (sql, replacements = {}, transaction) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
function present(r) {
  return {
    ...r.data,
    id: r.id,
    module: r.module,
    name: r.name,
    code: r.code,
    organizationId: r.organization_id,
    factoryId: r.factory_id,
    status: r.status,
    data: r.data,
    revision: Number(r.revision),
    unitType:
      r.data.unitType ||
      {
        organization: "Company",
        factories: "Factory",
        departments: "Department",
        "production-lines": "Production Line",
      }[r.module],
  };
}
function admin(user) {
  return userHasPermission(user, "MASTERS-ADMIN");
}
function allowed(user, r) {
  if (admin(user)) return true;
  return (user.accessScopes || []).some(
    (s) =>
      s.enabled !== false &&
      (!s.organizationId ||
        s.organizationId === r.organization_id ||
        (r.module === "organization" && s.organizationId === r.id)) &&
      (!r.factory_id || !s.factoryId || s.factoryId === r.factory_id),
  );
}
function assertScope(user, r) {
  if (!allowed(user, r))
    throw new HttpError(
      403,
      "Master record is outside your assigned organization/factory scope",
    );
}
function need(user, action) {
  if (!admin(user) && !userHasPermission(user, action))
    throw new HttpError(403, "Shared master permission required");
}
async function validateMembership(
  organizationId,
  factoryId,
  transaction,
  required = false,
) {
  if (!organizationId) {
    if (required || factoryId)
      throw new HttpError(422, "Choose an active company");
    return;
  }
  const company = (
    await query(
      "SELECT * FROM app_shared_masters WHERE id::text=:id AND module='organization' AND status='Active'",
      { id: organizationId },
      transaction,
    )
  )[0];
  if (!company || present(company).unitType !== "Company")
    throw new HttpError(422, "Choose an active company");
  if (factoryId) {
    const factory = (
      await query(
        "SELECT * FROM app_shared_masters WHERE id::text=:id AND module='factories' AND status='Active'",
        { id: factoryId },
        transaction,
      )
    )[0];
    if (!factory || factory.organization_id !== organizationId)
      throw new HttpError(
        422,
        "Choose an active factory belonging to this company",
      );
  }
}
async function list(req) {
  if (req.query.module === "vendors") {
    need(req.user, "MASTERS-READ");
    const page = Number(req.query.page || 1),
      pageSize = Number(req.query.pageSize || 20);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new HttpError(400, "Invalid pagination");
    const { Vendor } = require("../models");
    const { Op } = require("sequelize");
    const where = {};
    if (req.query.search)
      where[Op.or] = [
        {
          name: {
            [Op.iLike]: `%${String(req.query.search).replace(/[\\%_]/g, "\\$&")}%`,
          },
        },
        {
          code: {
            [Op.iLike]: `%${String(req.query.search).replace(/[\\%_]/g, "\\$&")}%`,
          },
        },
      ];
    if (!admin(req.user))
      where[Op.and] = {
        [Op.or]: (req.user.accessScopes || [])
          .filter((s) => s.enabled !== false)
          .map((s) => ({
            ...(s.organizationId ? { organizationId: s.organizationId } : {}),
            ...(s.factoryId ? { factoryId: s.factoryId } : {}),
          })),
      };
    const { rows, count } = await Vendor.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [
        ["name", "ASC"],
        ["id", "ASC"],
      ],
    });
    return {
      items: rows.map((v) => ({
        ...v.toJSON(),
        module: "vendors",
        revision: new Date(v.updatedAt).getTime(),
        manager: v.contactName,
        description: v.notes,
      })),
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    };
  }
  const page = Number(req.query.page || 1),
    pageSize = Number(req.query.pageSize || 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new HttpError(400, "Invalid pagination");
  const module = req.query.module || "hierarchy";
  if (module !== "hierarchy" && !kinds.includes(module))
    throw new HttpError(400, "Unknown shared catalog");
  const hierarchy =
    module === "hierarchy" ||
    [
      "organization",
      "factories",
      "departments",
      "production-lines",
      "organization-units",
    ].includes(module);
  const requestedType = req.query.unitType;
  const lookupFor = req.query.lookupFor;
  if (requestedType && lookupFor)
    throw new HttpError(
      400,
      "Choose either a hierarchy list or a parent lookup",
    );
  if (
    (requestedType || lookupFor) &&
    (!hierarchy || !Object.hasOwn(parents, requestedType || lookupFor))
  )
    throw new HttpError(400, "Invalid hierarchy filter");
  let visibleTypes = Object.keys(parents);
  if (hierarchy) {
    if (lookupFor) {
      need(req.user, hierarchyPermissions[lookupFor] + "-READ");
      visibleTypes = [...new Set([...parents[lookupFor], "Company"])];
    } else if (requestedType) {
      need(req.user, hierarchyPermissions[requestedType] + "-READ");
      visibleTypes = [requestedType];
    } else {
      visibleTypes = visibleTypes.filter(
        (type) =>
          userHasPermission(req.user, hierarchyPermissions[type] + "-READ") ||
          admin(req.user),
      );
      if (!visibleTypes.length)
        throw new HttpError(403, "Hierarchy read permission required");
    }
  } else need(req.user, "MASTERS-READ");
  const scopes = (req.user.accessScopes || [])
    .filter((s) => s.enabled !== false)
    .map((s) => (s.toJSON ? s.toJSON() : s));
  const where = `${module === "hierarchy" ? "module IN ('organization','factories','departments','production-lines','organization-units')" : "module=:module"}
    AND (:admin OR (organization_id IS NULL AND module IN ('units','currencies')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(CAST(:scopes AS jsonb)) s WHERE
      (COALESCE(s->>'organizationId','')='' OR s->>'organizationId'=organization_id OR (module='organization' AND s->>'organizationId'=id::text))
      AND (factory_id IS NULL OR COALESCE(s->>'factoryId','')='' OR s->>'factoryId'=factory_id)))
    AND (:hierarchy = false OR COALESCE(data->>'unitType', CASE module WHEN 'organization' THEN 'Company' WHEN 'factories' THEN 'Factory' WHEN 'departments' THEN 'Department' WHEN 'production-lines' THEN 'Production Line' END) IN (:visibleTypes))
    AND (:search = '' OR name ILIKE :pattern OR COALESCE(code,'') ILIKE :pattern)`;
  const values = {
    module,
    hierarchy,
    visibleTypes,
    admin: admin(req.user),
    scopes: JSON.stringify(scopes),
    search: String(req.query.search || "").slice(0, 180),
    pattern: `%${String(req.query.search || "")
      .slice(0, 180)
      .replace(/[\\%_]/g, "\\$&")}%`,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  const total = Number(
    (
      await query(
        `SELECT count(*) count FROM app_shared_masters WHERE ${where}`,
        values,
      )
    )[0].count,
  );
  const items = (
    await query(
      `SELECT * FROM app_shared_masters WHERE ${where} ORDER BY name,id LIMIT :limit OFFSET :offset`,
      values,
    )
  )
    .map(present)
    .map((row) =>
      lookupFor
        ? {
            id: row.id,
            module: row.module,
            name: row.name,
            code: row.code,
            unitType: row.unitType,
            organizationId: row.organizationId,
            factoryId: row.factoryId,
            parentId: row.parentId,
            status: row.status,
            revision: row.revision,
          }
        : row,
    );
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
async function save(user, recordId, body) {
  if (
    recordId &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      recordId,
    )
  )
    throw new HttpError(400, "Invalid shared master ID");
  if (
    body.module === "currencies" &&
    !Intl.supportedValuesOf("currency").includes(body.code)
  )
    throw new HttpError(422, "Choose a supported ISO currency code");
  if (body.module === "vendors") {
    need(user, "MASTERS-MANAGE");
    const { Vendor } = require("../models");
    return sequelize.transaction(async (transaction) => {
      await query("SELECT pg_advisory_xact_lock(70202030)", {}, transaction);
      const current = recordId
        ? await Vendor.findByPk(recordId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
          })
        : null;
      if (recordId && !current) throw new HttpError(404, "Vendor not found");
      if (current) {
        assertScope(user, {
          organization_id: current.organizationId,
          factory_id: current.factoryId,
        });
        if (Number(body.revision) !== new Date(current.updatedAt).getTime())
          throw new HttpError(409, "Vendor changed. Reload before saving");
      }
      const value = {
        code: String(body.code || "").trim(),
        name: String(body.name || "").trim(),
        organizationId: body.organizationId || null,
        factoryId: body.factoryId || null,
        status: body.status === "Inactive" ? "Inactive" : "Active",
        contactName: String(body.manager || ""),
        email: String(body.email || ""),
        phone: String(body.phone || ""),
        notes: String(body.description || ""),
      };
      await validateMembership(
        value.organizationId,
        value.factoryId,
        transaction,
      );
      if (!value.name || !value.code)
        throw new HttpError(422, "Vendor name and code required");
      if (
        value.code.length > 80 ||
        value.name.length > 180 ||
        value.contactName.length > 160 ||
        value.email.length > 180 ||
        value.phone.length > 80
      )
        throw new HttpError(422, "Vendor contact/name/code is too long");
      const duplicate = await Vendor.findOne({
        where: { code: value.code },
        transaction,
      });
      if (duplicate && String(duplicate.id) !== String(recordId))
        throw new HttpError(409, "Vendor code already exists");
      if (!admin(user))
        assertScope(user, {
          organization_id: value.organizationId,
          factory_id: value.factoryId,
        });
      const before = current?.toJSON() || null;
      const row = current
        ? await current.update(value, { transaction })
        : await Vendor.create(value, { transaction });
      await sequelize.query(
        "INSERT INTO app_shared_master_audit(record_id,actor,action,before_value,after_value) VALUES(:id,:actor,:action,CAST(:before AS jsonb),CAST(:after AS jsonb))",
        {
          replacements: {
            id: row.id,
            actor: String(user.employeeCode),
            action: "vendor.saved",
            before: JSON.stringify(before),
            after: JSON.stringify(row.toJSON()),
          },
          transaction,
        },
      );
      return {
        ...row.toJSON(),
        module: "vendors",
        revision: new Date(row.updatedAt).getTime(),
        manager: row.contactName,
        description: row.notes,
      };
    });
  }
  return sequelize.transaction(async (transaction) => {
    await query("SELECT pg_advisory_xact_lock(70202030)", {}, transaction);
    const current = recordId
      ? (
          await query(
            "SELECT * FROM app_shared_masters WHERE id=:id FOR UPDATE",
            { id: recordId },
            transaction,
          )
        )[0]
      : null;
    if (recordId && !current)
      throw new HttpError(404, "Master record not found");
    if (current) assertScope(user, current);
    if (current && Number(body.revision) !== Number(current.revision))
      throw new HttpError(409, "This master changed. Reload before saving.");
    const id = current?.id || randomUUID(),
      type =
        body.unitType ||
        current?.data.unitType ||
        {
          organization: "Company",
          factories: "Factory",
          departments: "Department",
          "production-lines": "Production Line",
        }[body.module],
      module = type ? modules[type] || "organization-units" : body.module;
    if (type && !Object.hasOwn(hierarchyPermissions, type))
      throw new HttpError(422, "Unknown hierarchy type");
    need(
      user,
      type ? hierarchyPermissions[type] + "-MANAGE" : "MASTERS-MANAGE",
    );
    if (
      !kinds.includes(module) ||
      !String(body.name || "").trim() ||
      !String(body.code || "").trim()
    )
      throw new HttpError(422, "Name, code and catalog/type are required");
    if (module === "organization-units" && !type)
      throw new HttpError(422, "Choose a hierarchy type");
    if (
      current &&
      (current.module !== module ||
        (type && current.data.unitType && current.data.unitType !== type))
    )
      throw new HttpError(422, "Existing master identity/type cannot change");
    let organizationId = body.organizationId || null,
      factoryId = body.factoryId || null,
      parentId = body.parentId || null;
    if (type) {
      if (!Object.hasOwn(parents, type))
        throw new HttpError(422, "Unknown hierarchy type");
      if (type === "Company") {
        if (
          !admin(user) &&
          !userHasPermission(user, "MASTERS-COMPANIES-MANAGE")
        )
          throw new HttpError(403, "Company management permission required");
        organizationId = id;
        factoryId = null;
        parentId = null;
      } else {
        const parent = (
          await query(
            "SELECT * FROM app_shared_masters WHERE id=:id",
            { id: parentId || id },
            transaction,
          )
        )[0];
        if (
          !parent ||
          parent.status !== "Active" ||
          !parents[type].includes(present(parent).unitType)
        )
          throw new HttpError(
            422,
            "Choose an active parent at the correct hierarchy level",
          );
        assertScope(user, parent);
        organizationId = parent.organization_id || parent.id;
        factoryId = type === "Factory" ? id : parent.factory_id;
        let ancestor = parent;
        for (let depth = 0; ancestor; depth++) {
          if (ancestor.id === id || depth > 20)
            throw new HttpError(422, "Hierarchy cannot contain a cycle");
          ancestor = ancestor.data.parentId
            ? (
                await query(
                  "SELECT * FROM app_shared_masters WHERE id=:id",
                  { id: ancestor.data.parentId },
                  transaction,
                )
              )[0]
            : null;
        }
      }
    }
    if (!type)
      await validateMembership(
        organizationId,
        factoryId,
        transaction,
        ["employees", "contacts"].includes(module),
      );
    if (
      current &&
      current.organization_id &&
      current.organization_id !== organizationId
    )
      throw new HttpError(
        422,
        "An existing record cannot move between companies",
      );
    const row = {
      id,
      module,
      name: String(body.name).trim(),
      code: String(body.code).trim(),
      organization_id: organizationId,
      factory_id: factoryId,
      status: body.status === "Inactive" ? "Inactive" : "Active",
    };
    assertScope(user, row);
    if (
      (
        await query(
          "SELECT id FROM app_shared_masters WHERE module=:module AND code=:code AND organization_id IS NOT DISTINCT FROM :organization_id AND id<>:id",
          row,
          transaction,
        )
      ).length
    )
      throw new HttpError(409, "Code already exists in this company/catalog");
    if (current && row.status === "Inactive") {
      const children = await query(
        "SELECT id FROM app_shared_masters WHERE data->>'parentId'=:id AND status='Active'",
        { id },
        transaction,
      );
      const refs = await query(
        "SELECT reference_count FROM app_shared_master_references WHERE record_id=:id AND reference_count>0",
        { id },
        transaction,
      );
      if (children.length || refs.length)
        throw new HttpError(
          409,
          "Reassign active children and operational references before archiving this master",
        );
    }
    const data = {
      ...(current?.data || {}),
      ...(body.data || {}),
      ...(type ? { unitType: type, parentId } : {}),
      manager: String(body.manager || ""),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      description: String(body.description || ""),
      organizationId,
      factoryId,
    };
    delete data.migrationIssue;
    if (row.name.length > 180 || row.code.length > 100)
      throw new HttpError(422, "Name/code is too long");
    await sequelize.query(
      `INSERT INTO app_shared_masters(id,module,name,code,organization_id,factory_id,status,data) VALUES(:id,:module,:name,:code,:organization_id,:factory_id,:status,CAST(:data AS jsonb)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,organization_id=excluded.organization_id,factory_id=excluded.factory_id,status=excluded.status,data=excluded.data,revision=app_shared_masters.revision+1,updated_at=now()`,
      { replacements: { ...row, data: JSON.stringify(data) }, transaction },
    );
    await sequelize.query(
      "INSERT INTO app_shared_master_audit(record_id,actor,action,before_value,after_value) VALUES(:id,:actor,:action,CAST(:before AS jsonb),CAST(:after AS jsonb))",
      {
        replacements: {
          id,
          actor: String(user.employeeCode),
          action: current ? "updated" : "created",
          before: JSON.stringify(current),
          after: JSON.stringify({ ...row, data }),
        },
        transaction,
      },
    );
    return present(
      (
        await query(
          "SELECT * FROM app_shared_masters WHERE id=:id",
          { id },
          transaction,
        )
      )[0],
    );
  });
}
module.exports = { kinds, parents, present, allowed, list, save, query };
